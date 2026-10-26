import { randomUUID } from 'crypto';
import mongoose, { Connection, Model } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { Product, ProductSchema } from '../src/shared/schemas/product.schema';
import {
  InventoryBatch,
  InventoryBatchSchema,
} from '../src/shared/schemas/inventory-batch.schema';
import {
  InventoryItem,
  InventoryItemSchema,
} from '../src/shared/schemas/inventory-item.schema';
import { InventoryService } from '../src/business/services/inventory.service';
import { ProductService } from '../src/business/services/product.service';

jest.setTimeout(180000);

describe('BE-110 inventory batches on an isolated replica set', () => {
  let server: MongoMemoryReplSet;
  let connection: Connection;
  let products: Model<Product>;
  let batches: Model<InventoryBatch>;
  let items: Model<InventoryItem>;
  let inventory: InventoryService;
  let service: ProductService;
  const admin = { _id: 'admin-1', Roles: ['admin'] } as any;
  const dto = (name: string, requestId: string, quantity = 3) => ({
    RequestId: requestId,
    ProductName: name,
    Description: 'Batch integration product',
    Category: 'MosquitoNet',
    SubCategory: 'Double',
    NetHeight: '5',
    ImageLinks: [],
    VideoLink: '',
    MakingPrice: 100,
    WholeSalerPrice: 120,
    EndUserPrice: 150,
    EndUserDiscountedPrice: 140,
    Quantity: quantity,
  });

  beforeAll(async () => {
    server = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    connection = await mongoose
      .createConnection(server.getUri(), { dbName: 'inventory_batches_test' })
      .asPromise();
    products = connection.model('Product', ProductSchema);
    batches = connection.model('InventoryBatch', InventoryBatchSchema);
    items = connection.model('InventoryItem', InventoryItemSchema);
    await Promise.all([products.init(), batches.init(), items.init()]);
    inventory = new InventoryService(batches, items);
    service = new ProductService(
      products,
      {} as any,
      {} as any,
      {} as any,
      { getUid: () => randomUUID() } as any,
      inventory,
    );
  });

  afterAll(async () => {
    await connection?.close();
    await server?.stop();
  });

  beforeEach(async () => {
    await Promise.all([
      items.deleteMany({}),
      batches.deleteMany({}),
      products.deleteMany({}),
    ]);
  });

  it('creates one batch and one globally unique serial per initial stock unit', async () => {
    await service.createProduct(dto('Initial net', 'create-1', 3), admin);
    const product = await products.findOne({ ProductName: 'Initial net' });
    const productBatches = await batches.find({ ProductId: product._id });
    const productItems = await items.find({ ProductId: product._id });
    expect(productBatches).toHaveLength(1);
    expect(productBatches[0].QuantityReceived).toBe(3);
    expect(productItems).toHaveLength(3);
    expect(new Set(productItems.map((x) => x.SerialNumber)).size).toBe(3);
    for (const item of productItems) {
      expect(
        item.SerialNumber.startsWith(`${productBatches[0].BatchId}_`),
      ).toBe(true);
    }
  });

  it('replays create and concurrent production request IDs without double-adding stock', async () => {
    await service.createProduct(dto('Replay net', 'create-replay', 1), admin);
    await service.createProduct(dto('Replay net', 'create-replay', 1), admin);
    const product = await products.findOne({ ProductName: 'Replay net' });
    expect(await products.countDocuments()).toBe(1);
    expect(await batches.countDocuments()).toBe(1);

    const intake = {
      RequestId: 'intake-replay',
      ProductionInfo: [{ ProductId: product._id, Quantity: 2 }],
    };
    const results = await Promise.allSettled([
      service.addProduction(intake, admin),
      service.addProduction(intake, admin),
    ]);
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    expect((await products.findById(product._id)).Quantity).toBe(3);
    expect(await batches.countDocuments()).toBe(2);
    expect(await items.countDocuments()).toBe(3);

    await expect(
      service.createProduct(
        dto('Different payload', 'create-replay', 1),
        admin,
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.addProduction(
        {
          RequestId: 'intake-replay',
          ProductionInfo: [{ ProductId: product._id, Quantity: 3 }],
        },
        admin,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('creates different batches across later additions and globally unique serials across products', async () => {
    await service.createProduct(dto('Product A', 'create-a', 2), admin);
    await service.createProduct(dto('Product B', 'create-b', 2), admin);
    const [a] = await products.find({ ProductName: 'Product A' });
    await service.addProduction(
      {
        RequestId: 'intake-a',
        ProductionInfo: [{ ProductId: a._id, Quantity: 2 }],
      },
      admin,
    );
    expect(
      new Set((await batches.find({ ProductId: a._id })).map((x) => x.BatchId))
        .size,
    ).toBe(2);
    const allSerials = (await items.find()).map((x) => x.SerialNumber);
    expect(new Set(allSerials).size).toBe(allSerials.length);
  });

  it('rolls back product totals, batches and items when any intake row fails', async () => {
    await service.createProduct(
      dto('Rollback net', 'create-rollback', 1),
      admin,
    );
    const product = await products.findOne({ ProductName: 'Rollback net' });
    await expect(
      service.addProduction(
        {
          RequestId: 'rollback-intake',
          ProductionInfo: [
            { ProductId: product._id, Quantity: 2 },
            { ProductId: 'missing-product', Quantity: 1 },
          ],
        },
        admin,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect((await products.findById(product._id)).Quantity).toBe(1);
    expect(await batches.countDocuments({ RequestId: 'rollback-intake' })).toBe(
      0,
    );
    expect(await items.countDocuments({ ProductId: product._id })).toBe(1);
  });

  it('keeps serials behind admin-only projections and rejects non-admin inventory reads', async () => {
    await service.createProduct(dto('Private net', 'create-private', 1), admin);
    const product = await products.findOne({ ProductName: 'Private net' });
    const publicJson = JSON.stringify(
      await service.getClientProduct({ page: '1', size: '10' }, {} as any),
    );
    expect(publicJson).not.toMatch(/SerialNumber|BatchId|CreationRequestId/);
    const batchPage = await inventory.listBatches(
      { ProductId: product._id, Page: 1, Size: 10 },
      admin,
    );
    const itemPage = await inventory.listItems(
      { BatchId: batchPage.Data[0].BatchId, Page: 1, Size: 25 },
      admin,
    );
    expect(itemPage.Data[0].SerialNumber).toContain('_');
    await expect(
      inventory.listItems(
        { BatchId: batchPage.Data[0].BatchId, Page: 1, Size: 25 },
        { _id: 'wholesaler', Roles: ['wholesaler'] } as any,
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
});
