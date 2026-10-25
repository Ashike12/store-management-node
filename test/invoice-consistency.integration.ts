import mongoose, { Connection, Model } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { InvoiceService } from '../src/business/services/invoice.service';
import { Invoice, InvoiceSchema } from '../src/shared/schemas/invoice.schema';
import { Product, ProductSchema } from '../src/shared/schemas/product.schema';
import {
  ProductSell,
  ProductSellSchema,
} from '../src/shared/schemas/productSell.schema';
import { User, UserSchema } from '../src/shared/schemas/user.schema';

jest.setTimeout(180000);

describe('invoice consistency on an isolated local replica set', () => {
  let server: MongoMemoryReplSet;
  let connection: Connection;
  let invoices: Model<Invoice>;
  let products: Model<Product>;
  let sells: Model<ProductSell>;
  let users: Model<User>;
  let service: InvoiceService;
  let id = 0;
  const admin = { _id: 'admin', Roles: ['admin'] } as any;
  const ownerA = { _id: 'wholesaler-a', Roles: ['wholesaler'] } as any;
  const productInvoice = (overrides: Record<string, unknown> = {}) => ({
    InvoiceType: 'WHOLESALE',
    WholeSalerId: 'wholesaler-a',
    PaymentAmount: 250,
    ProductSellInfo: [{ ProductId: 'net-a', SellingPrice: 150, Quantity: 2 }],
    ...overrides,
  });
  const duePayment = (amount: number) => ({
    InvoiceType: 'DUE_PAYMENT',
    WholeSalerId: 'wholesaler-a',
    PaymentAmount: amount,
    ProductSellInfo: [],
  });

  beforeAll(async () => {
    // This suite never reads .env and never contacts Atlas or Redis.
    server = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    connection = await mongoose
      .createConnection(server.getUri(), { dbName: 'invoice_consistency_test' })
      .asPromise();
    invoices = connection.model('Invoice', InvoiceSchema);
    products = connection.model('Product', ProductSchema);
    sells = connection.model('ProductSell', ProductSellSchema);
    users = connection.model('User', UserSchema);
    await Promise.all([
      invoices.init(),
      products.init(),
      sells.init(),
      users.init(),
    ]);
    service = new InvoiceService(products, sells, invoices, users, {
      getUid: () => `test-${++id}`,
    } as any);
  });

  afterAll(async () => {
    await connection?.close();
    await server?.stop();
  });

  beforeEach(async () => {
    id = 0;
    await Promise.all([
      invoices.deleteMany({}),
      sells.deleteMany({}),
      products.deleteMany({}),
      users.deleteMany({}),
    ]);
    await users.create([
      {
        _id: 'wholesaler-a',
        FirstName: 'Alpha',
        LastName: 'Seller',
        DisplayName: 'Alpha Seller',
        Roles: ['wholesaler'],
      },
      {
        _id: 'wholesaler-b',
        FirstName: 'Beta',
        LastName: 'Seller',
        DisplayName: 'Beta Seller',
        Roles: ['wholesaler'],
      },
    ]);
    await products.create([
      {
        _id: 'net-a',
        ProductName: 'Net A',
        MakingPrice: 100,
        Quantity: 10,
      },
      {
        _id: 'net-z',
        ProductName: 'Net Z',
        MakingPrice: 50,
        Quantity: 0,
      },
    ]);
  });

  it('creates stock, sales, due and dashboard values atomically', async () => {
    await service.createInvoice(productInvoice() as any, admin);

    expect((await products.findById('net-a'))?.Quantity).toBe(8);
    expect(await sells.countDocuments({ ProductId: 'net-a' })).toBe(1);
    expect(await sells.findOne({ ProductId: 'net-a' })).toMatchObject({
      MakingPrice: 100,
      SellingPrice: 150,
      Quantity: 2,
    });
    const invoice = await invoices.findOne({ WholeSalerId: 'wholesaler-a' });
    expect(invoice).toMatchObject({
      TotalAmount: 300,
      PaymentAmount: 250,
      ProductCostAmount: 200,
      GrossProfit: 100,
      RealizedCashMargin: 50,
    });
    const dashboard = await service.getDashboardStatsData(admin);
    expect(dashboard.Data).toMatchObject({
      ThisMonthCashCollected: 250,
      ThisMonthGrossProfit: 100,
      ThisMonthRealizedCashMargin: 50,
      ThisMonthTotalInvoice: 1,
      ThisMonthTotalSell: 2,
      TotalOutstandingDue: 50,
      TotalCustomerCredit: 0,
      TotalCostAtRisk: 0,
    });
  });

  it('rolls back every document when any product has insufficient stock', async () => {
    await expect(
      service.createInvoice(
        productInvoice({
          PaymentAmount: 200,
          ProductSellInfo: [
            { ProductId: 'net-a', SellingPrice: 150, Quantity: 2 },
            { ProductId: 'net-z', SellingPrice: 50, Quantity: 1 },
          ],
        }) as any,
        admin,
      ),
    ).rejects.toMatchObject({ status: 409 });

    expect((await products.findById('net-a'))?.Quantity).toBe(10);
    expect(await invoices.countDocuments({})).toBe(0);
    expect(await sells.countDocuments({})).toBe(0);
  });

  it('rolls back stock and sale rows when the final invoice write fails', async () => {
    const createInvoice = jest
      .spyOn(invoices, 'create')
      .mockRejectedValueOnce(new Error('forced invoice write failure'));
    try {
      await expect(
        service.createInvoice(productInvoice() as any, admin),
      ).rejects.toThrow('forced invoice write failure');
    } finally {
      createInvoice.mockRestore();
    }

    expect((await products.findById('net-a'))?.Quantity).toBe(10);
    expect(await sells.countDocuments({})).toBe(0);
    expect(await invoices.countDocuments({})).toBe(0);
  });

  it('restores old stock on edit and rolls back a failed replacement', async () => {
    await service.createInvoice(productInvoice() as any, admin);
    const invoice = await invoices.findOne({});

    await service.updateInvoice(
      {
        ...productInvoice({
          PaymentAmount: 400,
          ProductSellInfo: [
            { ProductId: 'net-a', SellingPrice: 150, Quantity: 3 },
          ],
        }),
        ItemId: invoice!._id,
      } as any,
      admin,
    );
    expect((await products.findById('net-a'))?.Quantity).toBe(7);
    expect(await sells.findOne({ InvoiceId: invoice!._id })).toMatchObject({
      Quantity: 3,
    });
    expect(await invoices.findById(invoice!._id)).toMatchObject({
      TotalAmount: 450,
      PaymentAmount: 400,
      ProductCostAmount: 300,
      GrossProfit: 150,
      RealizedCashMargin: 100,
    });

    await expect(
      service.updateInvoice(
        {
          ...productInvoice({
            PaymentAmount: 450,
            ProductSellInfo: [
              { ProductId: 'net-a', SellingPrice: 150, Quantity: 20 },
            ],
          }),
          ItemId: invoice!._id,
        } as any,
        admin,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect((await products.findById('net-a'))?.Quantity).toBe(7);
    expect(await sells.findOne({ InvoiceId: invoice!._id })).toMatchObject({
      Quantity: 3,
    });
    expect(await invoices.findById(invoice!._id)).toMatchObject({
      TotalAmount: 450,
      PaymentAmount: 400,
    });
  });

  it('restores stock and removes product sales when deleting an invoice', async () => {
    await service.createInvoice(productInvoice() as any, admin);
    const invoice = await invoices.findOne({});
    await service.deleteInvoiceById(invoice!._id, admin);

    expect((await products.findById('net-a'))?.Quantity).toBe(10);
    expect(await sells.countDocuments({})).toBe(0);
    expect(await invoices.countDocuments({})).toBe(0);
    expect((await service.getDashboardStatsData(admin)).Data).toMatchObject({
      ThisMonthCashCollected: 0,
      ThisMonthGrossProfit: 0,
      ThisMonthRealizedCashMargin: 0,
      ThisMonthTotalInvoice: 0,
      ThisMonthTotalSell: 0,
      TotalOutstandingDue: 0,
      TotalCostAtRisk: 0,
    });
  });

  it('applies due-payment create, edit and delete to total due without stock writes', async () => {
    await service.createInvoice(
      productInvoice({ PaymentAmount: 100 }) as any,
      admin,
    );
    await service.createInvoice(duePayment(60), admin);
    const payment = await invoices.findOne({ InvoiceType: 'DUE_PAYMENT' });

    expect((await products.findById('net-a'))?.Quantity).toBe(8);
    expect(payment).toMatchObject({
      ProductCostAmount: 0,
      GrossProfit: 0,
      RealizedCashMargin: 60,
    });
    expect((await service.getDashboardStatsData(admin)).Data).toMatchObject({
      ThisMonthCashCollected: 160,
      ThisMonthGrossProfit: 100,
      ThisMonthRealizedCashMargin: -40,
      TotalOutstandingDue: 140,
      TotalCostAtRisk: 40,
    });
    await service.updateInvoice(
      { ...duePayment(80), ItemId: payment!._id },
      admin,
    );
    expect((await service.getDashboardStatsData(admin)).Data).toMatchObject({
      ThisMonthCashCollected: 180,
      ThisMonthGrossProfit: 100,
      ThisMonthRealizedCashMargin: -20,
      TotalOutstandingDue: 120,
      TotalCostAtRisk: 20,
    });
    await service.deleteInvoiceById(payment!._id, admin);
    expect(
      (await service.getDashboardStatsData(admin)).Data.TotalOutstandingDue,
    ).toBe(200);
    expect((await products.findById('net-a'))?.Quantity).toBe(8);
    expect(await sells.countDocuments({})).toBe(1);
  });

  it('converts product and due invoices while synchronizing stock and owner ACLs', async () => {
    await service.createInvoice(productInvoice() as any, admin);
    const invoice = await invoices.findOne({});

    await service.updateInvoice(
      { ...duePayment(50), ItemId: invoice!._id },
      admin,
    );
    expect((await products.findById('net-a'))?.Quantity).toBe(10);
    expect(await sells.countDocuments({ InvoiceId: invoice!._id })).toBe(0);
    expect(await invoices.findById(invoice!._id)).toMatchObject({
      InvoiceType: 'DUE_PAYMENT',
      WholeSalerId: 'wholesaler-a',
      IdsAllowedToRead: ['wholesaler-a'],
    });

    await service.updateInvoice(
      {
        ...productInvoice({
          WholeSalerId: 'wholesaler-b',
          PaymentAmount: 150,
          ProductSellInfo: [
            { ProductId: 'net-a', SellingPrice: 150, Quantity: 1 },
          ],
        }),
        ItemId: invoice!._id,
      } as any,
      admin,
    );
    expect((await products.findById('net-a'))?.Quantity).toBe(9);
    expect(await invoices.findById(invoice!._id)).toMatchObject({
      InvoiceType: 'WHOLESALE',
      WholeSalerId: 'wholesaler-b',
      IdsAllowedToRead: ['wholesaler-b'],
    });
    expect(await sells.findOne({ InvoiceId: invoice!._id })).toMatchObject({
      WholeSalerId: 'wholesaler-b',
      IdsAllowedToRead: ['wholesaler-b'],
      Quantity: 1,
    });
  });

  it('excludes previous-month invoices and sales from monthly dashboard totals', async () => {
    await service.createInvoice(productInvoice() as any, admin);
    const previousMonth = new Date();
    previousMonth.setUTCMonth(previousMonth.getUTCMonth() - 1);
    const createdDate = previousMonth.toISOString();
    await invoices.updateMany({}, { $set: { CreatedDate: createdDate } });
    await sells.updateMany({}, { $set: { CreatedDate: createdDate } });

    const dashboard = await service.getDashboardStatsData(admin);
    expect(dashboard.Data).toMatchObject({
      ThisMonthCashCollected: 0,
      ThisMonthGrossProfit: 0,
      ThisMonthRealizedCashMargin: 0,
      ThisMonthTotalInvoice: 0,
      ThisMonthTotalSell: 0,
      TotalOutstandingDue: 50,
    });
  });

  it('does not oversell when invoices are created concurrently', async () => {
    const request = productInvoice({
      PaymentAmount: 1000,
      ProductSellInfo: [{ ProductId: 'net-a', SellingPrice: 150, Quantity: 7 }],
    });
    const results = await Promise.allSettled([
      service.createInvoice(request as any, admin),
      service.createInvoice(request as any, admin),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect((await products.findById('net-a'))?.Quantity).toBe(3);
    expect(await invoices.countDocuments({})).toBe(1);
    expect(await sells.countDocuments({})).toBe(1);
  });

  it('aggregates duplicate product rows and generates unique invoice numbers', async () => {
    await service.createInvoice(
      productInvoice({
        PaymentAmount: 750,
        ProductSellInfo: [
          { ProductId: 'net-a', SellingPrice: 150, Quantity: 2 },
          { ProductId: 'net-a', SellingPrice: 150, Quantity: 3 },
        ],
      }) as any,
      admin,
    );
    await service.createInvoice(
      productInvoice({
        PaymentAmount: 150,
        ProductSellInfo: [
          { ProductId: 'net-a', SellingPrice: 150, Quantity: 1 },
        ],
      }) as any,
      admin,
    );

    expect((await products.findById('net-a'))?.Quantity).toBe(4);
    expect(await sells.countDocuments({})).toBe(3);
    const numbers = (await invoices.find({})).map(
      (invoice) => invoice.InvoiceNumber,
    );
    expect(new Set(numbers).size).toBe(2);
  });

  it('isolates wholesaler list, detail and dashboard data and hides profit', async () => {
    await service.createInvoice(productInvoice() as any, admin);
    await service.createInvoice(
      productInvoice({
        WholeSalerId: 'wholesaler-b',
        PaymentAmount: 150,
        ProductSellInfo: [
          { ProductId: 'net-a', SellingPrice: 150, Quantity: 1 },
        ],
      }) as any,
      admin,
    );
    const invoiceB = await invoices.findOne({ WholeSalerId: 'wholesaler-b' });

    const listA = await service.getInvoiceList(
      { size: '10', page: '1' },
      { ItemId: '', WholesalerId: 'wholesaler-b' },
      ownerA,
    );
    expect(listA.TotalCount).toBe(1);
    expect(listA.Data[0].WholeSalerId).toBe('wholesaler-a');
    expect(listA.Data[0]).not.toHaveProperty('ProductCostAmount');
    expect(listA.Data[0]).not.toHaveProperty('GrossProfit');
    expect(listA.Data[0]).not.toHaveProperty('RealizedCashMargin');
    expect(listA.Summary).toEqual({
      TotalBilled: 300,
      CashCollected: 250,
      OutstandingDue: 50,
      CustomerCredit: 0,
    });
    await expect(
      service.getInvoiceList({ size: '10' }, { ItemId: invoiceB!._id }, ownerA),
    ).rejects.toMatchObject({ status: 400 });

    const dashboardA = await service.getDashboardStatsData(ownerA);
    expect(dashboardA.Data.ThisMonthTotalInvoice).toBe(1);
    expect(dashboardA.Data.RecentInvoiceData).toHaveLength(1);
    expect(dashboardA.Data.RecentInvoiceData[0]).not.toHaveProperty(
      'GrossProfit',
    );
    expect(dashboardA.Data.RecentInvoiceData[0]).not.toHaveProperty(
      'RealizedCashMargin',
    );
    expect(dashboardA.Data).not.toHaveProperty('ThisMonthGrossProfit');

    const adminList = await service.getInvoiceList(
      { size: '10' },
      { ItemId: '' },
      { ...ownerA, Roles: ['wholesaler', 'admin'] } as any,
    );
    expect(adminList.TotalCount).toBe(2);
    expect(adminList.Data.every((item) => 'GrossProfit' in item)).toBe(true);
    expect(adminList.Data.every((item) => 'RealizedCashMargin' in item)).toBe(
      true,
    );
    expect(adminList.Summary).toMatchObject({
      TotalBilled: 450,
      ProductCostAmount: 300,
      CashCollected: 400,
      GrossProfit: 150,
      RealizedCashMargin: 100,
      OutstandingDue: 50,
    });
  });

  it('denies direct service access for every unsupported role', async () => {
    for (const role of ['customer', 'appuser', 'annonymous']) {
      const user = { _id: role, Roles: [role] } as any;
      await expect(
        service.createInvoice(productInvoice() as any, user),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        service.getInvoiceList({ size: '10' }, { ItemId: '' }, user),
      ).rejects.toMatchObject({ status: 403 });
      await expect(service.getDashboardStatsData(user)).rejects.toMatchObject({
        status: 403,
      });
    }
    expect(await invoices.countDocuments({})).toBe(0);
  });
});
