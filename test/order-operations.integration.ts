import mongoose, { Connection, Model } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { Order, OrderSchema } from '../src/shared/schemas/order.schema';
import { Product, ProductSchema } from '../src/shared/schemas/product.schema';
import { OrderOperationsService } from '../src/business/services/order-operations.service';

jest.setTimeout(180000);
describe('order operations on an isolated local replica set', () => {
  let server: MongoMemoryReplSet;
  let connection: Connection;
  let orders: Model<Order>;
  let products: Model<Product>;
  let service: OrderOperationsService;
  const admin = { _id: 'admin-test', Roles: ['admin'] } as any;
  const create = (
    id: string,
    quantity = 1,
    requirements = [{ ProductId: 'a', Quantity: quantity }],
  ) =>
    orders.create({
      _id: id,
      RequestId: id,
      RequestHash: id,
      OrderNumber: id,
      CustomerName: 'Buyer',
      PhoneNumber: '123',
      CreatedDate: new Date().toISOString(),
      OrderStatus: 'pending',
      PaymentStatus: 'unpaid',
      Version: 0,
      Items: [
        {
          ProductId: 'a',
          Quantity: quantity,
          InventoryRequirements: requirements,
        },
      ],
    });
  const transition = (id: string, Status: string, ExpectedVersion = 0) =>
    service.transition(
      { ItemId: id, Status, ExpectedVersion, Note: 'Test' },
      admin,
    );
  beforeAll(async () => {
    // Never reads .env or uses any remote Mongo/Redis connection.
    server = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    connection = await mongoose
      .createConnection(server.getUri(), { dbName: 'order_operations_test' })
      .asPromise();
    orders = connection.model('Order', OrderSchema);
    products = connection.model('Product', ProductSchema);
    await orders.init();
    service = new OrderOperationsService(orders, products);
  });
  afterAll(async () => {
    await connection?.close();
    await server?.stop();
  });
  beforeEach(async () => {
    await orders.deleteMany({});
    await products.deleteMany({});
    await products.create({ _id: 'a', Quantity: 10 });
  });

  it('does not deduct pending stock; duplicate confirmations deduct exactly once', async () => {
    await create('one', 3);
    expect((await products.findById('a')).Quantity).toBe(10);
    await Promise.all([
      transition('one', 'confirmed'),
      transition('one', 'confirmed'),
    ]);
    expect((await products.findById('a')).Quantity).toBe(7);
    const order = await orders.findById('one');
    expect(order.AuditHistory).toHaveLength(1);
    expect(order.PaymentStatus).toBe('unpaid');
  });
  it('concurrent orders cannot oversell the last stock', async () => {
    await create('one', 7);
    await create('two', 7);
    const results = await Promise.allSettled([
      transition('one', 'confirmed'),
      transition('two', 'confirmed'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await products.findById('a')).Quantity).toBe(3);
    expect(await orders.countDocuments({ OrderStatus: 'confirmed' })).toBe(1);
  });
  it('rolls back every material and the order on insufficient stock', async () => {
    await products.create({ _id: 'z', Quantity: 0 });
    await create('one', 1, [
      { ProductId: 'a', Quantity: 2 },
      { ProductId: 'z', Quantity: 1 },
    ]);
    await expect(transition('one', 'confirmed')).rejects.toMatchObject({
      status: 409,
    });
    expect((await products.findById('a')).Quantity).toBe(10);
    expect((await orders.findById('one')).OrderStatus).toBe('pending');
    expect((await orders.findById('one')).AuditHistory).toHaveLength(0);
  });
  it('aggregates same-material fractional yards and restores the exact snapshot only once', async () => {
    await create('one', 1, [
      { ProductId: 'a', Quantity: 1 / 3 },
      { ProductId: 'a', Quantity: 2 / 3 },
    ]);
    await transition('one', 'confirmed');
    expect((await products.findById('a')).Quantity).toBe(9);
    await transition('one', 'processing', 1);
    await Promise.all([
      transition('one', 'cancelled', 2),
      transition('one', 'cancelled', 2),
    ]);
    expect((await products.findById('a')).Quantity).toBe(10);
    expect((await orders.findById('one')).AuditHistory).toHaveLength(3);
  });
  it('cancels pending without restocking, rejects skips and stale updates, forbids post-shipping cancellation', async () => {
    await create('cancel');
    await transition('cancel', 'cancelled');
    expect((await products.findById('a')).Quantity).toBe(10);
    await create('one');
    await expect(transition('one', 'shipped')).rejects.toMatchObject({
      status: 400,
    });
    await transition('one', 'confirmed');
    await expect(transition('one', 'processing', 0)).rejects.toMatchObject({
      status: 409,
    });
    await transition('one', 'processing', 1);
    await transition('one', 'shipped', 2);
    await expect(transition('one', 'cancelled', 3)).rejects.toMatchObject({
      status: 400,
    });
    await transition('one', 'delivered', 3);
    expect((await orders.findById('one')).PaymentStatus).toBe('unpaid');
  });
  it('enforces admin-only access even when called without the controller', async () => {
    for (const role of ['customer', 'wholesaler', 'appuser', 'annonymous']) {
      const user = { _id: role, Roles: [role] } as any;
      await expect(
        service.list({ Page: 1, Size: 10 }, user),
      ).rejects.toMatchObject({ status: 403 });
      await expect(service.detail('one', user)).rejects.toMatchObject({
        status: 403,
      });
      await expect(
        service.transition(
          { ItemId: 'one', Status: 'confirmed', ExpectedVersion: 0 },
          user,
        ),
      ).rejects.toMatchObject({ status: 403 });
    }
  });
  it('paginates and filters using literal search rather than injected regex', async () => {
    await create('one');
    await create('two');
    const result = await service.list(
      { Page: 2, Size: 1, Status: 'pending', Search: 'Buyer' },
      admin,
    );
    expect(result.TotalCount).toBe(2);
    expect(result.Data).toHaveLength(1);
    expect(result.Data[0].RequestHash).toBeUndefined();
    expect(
      (await service.list({ Page: 1, Size: 10, Search: '.*' }, admin))
        .TotalCount,
    ).toBe(0);
    await expect(service.detail('missing', admin)).rejects.toMatchObject({
      status: 404,
    });
  });
  it('enforces unique checkout request IDs at the database level', async () => {
    await create('one');
    await expect(
      orders.create({ _id: 'two', RequestId: 'one', RequestHash: 'one' }),
    ).rejects.toMatchObject({ code: 11000 });
  });
});
