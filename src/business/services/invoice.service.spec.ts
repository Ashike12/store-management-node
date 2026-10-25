import { InvoiceService } from './invoice.service';

describe('InvoiceService access, validation and reporting', () => {
  const session = {
    withTransaction: jest.fn(),
    endSession: jest.fn(),
  };
  const invoices = {
    db: { startSession: jest.fn() },
    create: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
    findOne: jest.fn(),
    updateOne: jest.fn(),
    deleteOne: jest.fn(),
    aggregate: jest.fn(),
  };
  const sells = {
    insertMany: jest.fn(),
    find: jest.fn(),
    deleteMany: jest.fn(),
    aggregate: jest.fn(),
  };
  const products = { findOne: jest.fn(), updateOne: jest.fn() };
  const users = { findOne: jest.fn() };
  const invoiceQuery = {
    sort: jest.fn(),
    limit: jest.fn(),
    skip: jest.fn(),
  };
  const admin = { _id: 'admin', Roles: ['admin'] } as any;
  const wholesaler = { _id: 'owner', Roles: ['wholesaler'] } as any;
  const due = {
    InvoiceType: 'DUE_PAYMENT',
    PaymentAmount: 100,
    WholeSalerId: 'owner',
    ProductSellInfo: [],
  };
  let service: InvoiceService;
  let uid = 0;

  const sessionResult = <T>(value: T) => ({
    session: jest.fn().mockResolvedValue(value),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    uid = 0;
    session.withTransaction.mockImplementation(async (operation) =>
      operation(),
    );
    session.endSession.mockResolvedValue(undefined);
    invoices.db.startSession.mockResolvedValue(session);
    invoices.find.mockReturnValue(invoiceQuery);
    invoiceQuery.sort.mockReturnValue(invoiceQuery);
    invoiceQuery.limit.mockReturnValue(invoiceQuery);
    invoiceQuery.skip.mockResolvedValue([
      {
        toObject: () => ({
          _id: 'invoice-1',
          ...due,
          TotalAmount: 100,
          ProfitMargin: 100,
        }),
      },
    ]);
    invoices.countDocuments.mockResolvedValue(1);
    sells.find.mockResolvedValue([]);
    users.findOne.mockReturnValue(
      sessionResult({
        _id: 'owner',
        FirstName: 'Test',
        LastName: 'User',
        DisplayName: 'Test User',
        Roles: ['wholesaler'],
      }),
    );
    invoices.create.mockResolvedValue([]);
    service = new InvoiceService(
      products as any,
      sells as any,
      invoices as any,
      users as any,
      { getUid: () => `id-${++uid}` } as any,
    );
  });

  it.each([
    undefined,
    { _id: 'customer', Roles: ['customer'] },
    { _id: 'appuser', Roles: ['appuser'] },
    { _id: 'owner', Roles: ['wholesaler'] },
  ])('blocks invoice mutations without admin role: %j', async (user) => {
    await expect(service.createInvoice(due, user as any)).rejects.toMatchObject(
      {
        status: 403,
      },
    );
    await expect(
      service.updateInvoice({ ...due, ItemId: 'invoice-1' }, user as any),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service.deleteInvoiceById('invoice-1', user as any),
    ).rejects.toMatchObject({ status: 403 });
    expect(invoices.db.startSession).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    { _id: 'customer', Roles: ['customer'] },
    { _id: 'appuser', Roles: ['appuser'] },
  ])(
    'blocks invoice reads without admin or wholesaler role: %j',
    async (user) => {
      await expect(
        service.getInvoiceList({ size: '10' }, { ItemId: '' }, user as any),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        service.getDashboardStatsData(user as any),
      ).rejects.toMatchObject({ status: 403 });
    },
  );

  it('rejects product rows on due-payment invoices', async () => {
    await expect(
      service.createInvoice(
        {
          ...due,
          ProductSellInfo: [
            { ProductId: 'net', SellingPrice: 10, Quantity: 1 },
          ],
        },
        admin,
      ),
    ).rejects.toThrow('cannot contain products');
    expect(invoices.db.startSession).not.toHaveBeenCalled();
  });

  it.each([
    { size: '0' },
    { size: '101' },
    { size: 'invalid' },
    { page: '0' },
    { page: '1.5' },
  ])('rejects invalid invoice pagination: %j', async (query) => {
    await expect(
      service.getInvoiceList(query as any, { ItemId: '' }, admin),
    ).rejects.toThrow('Invalid invoice pagination');
    expect(invoices.find).not.toHaveBeenCalled();
  });

  it('forces wholesaler ownership and removes profit from list responses', async () => {
    const result = await service.getInvoiceList(
      { size: '10', page: '1' },
      { ItemId: '', WholesalerId: 'other' },
      wholesaler,
    );
    expect(invoices.find).toHaveBeenCalledWith({ WholeSalerId: 'owner' });
    expect(invoices.countDocuments).toHaveBeenCalledWith({
      WholeSalerId: 'owner',
    });
    expect(result.Data[0]).not.toHaveProperty('ProfitMargin');
  });

  it('scopes detail sale rows to the owning wholesaler', async () => {
    await service.getInvoiceList(
      { size: '10' },
      { ItemId: 'invoice-1' },
      wholesaler,
    );
    expect(sells.find).toHaveBeenCalledWith({
      InvoiceId: 'invoice-1',
      WholeSalerId: 'owner',
    });
  });

  it('treats a user with admin and wholesaler roles as admin', async () => {
    const result = await service.getInvoiceList(
      { size: '10' },
      { ItemId: '' },
      { _id: 'owner', Roles: ['wholesaler', 'admin'] } as any,
    );
    expect(invoices.find).toHaveBeenCalledWith({});
    expect(result.Data[0].ProfitMargin).toBe(100);
  });

  it('combines admin invoice and wholesaler filters', async () => {
    await service.getInvoiceList(
      { size: '10' },
      { ItemId: 'invoice-1', WholesalerId: 'owner' },
      admin,
    );
    expect(invoices.find).toHaveBeenCalledWith({
      _id: 'invoice-1',
      WholeSalerId: 'owner',
    });
  });

  it.each([
    [{ ...due, PaymentAmount: Number.NaN }, 'Payment amount'],
    [{ ...due, PaymentAmount: 0 }, 'greater than 0'],
    [
      {
        ...due,
        InvoiceType: 'CONSUMER',
        WholeSalerId: 'owner',
        ProductSellInfo: [{ ProductId: 'net', SellingPrice: 10, Quantity: 1 }],
      },
      'cannot be assigned',
    ],
    [
      {
        ...due,
        InvoiceType: 'CONSUMER',
        WholeSalerId: '',
        ProductSellInfo: [{ ProductId: 'net', SellingPrice: 10, Quantity: -1 }],
      },
      'quantity',
    ],
  ])(
    'rejects invalid invoice input before opening a transaction',
    async (dto, message) => {
      await expect(service.createInvoice(dto as any, admin)).rejects.toThrow(
        message as string,
      );
      expect(invoices.db.startSession).not.toHaveBeenCalled();
    },
  );

  it('creates due payments transactionally without stock or product-sale writes', async () => {
    await service.createInvoice(due, admin);
    expect(session.withTransaction).toHaveBeenCalledTimes(1);
    expect(invoices.create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          TotalAmount: 100,
          PaymentAmount: 100,
          ProfitMargin: 100,
          InvoiceType: 'DUE_PAYMENT',
          WholeSalerId: 'owner',
        }),
      ],
      { session },
    );
    expect(sells.insertMany).not.toHaveBeenCalled();
    expect(products.updateOne).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });

  it('rejects users without the wholesaler role as invoice owners', async () => {
    users.findOne.mockReturnValue(
      sessionResult({ _id: 'owner', Roles: ['customer'] }),
    );
    await expect(service.createInvoice(due, admin)).rejects.toThrow(
      'Wholesaler not found',
    );
    expect(invoices.create).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });

  it.each([true, false])(
    'scopes dashboard queries and shapes results for wholesaler=%s',
    async (asWholesaler) => {
      invoices.aggregate.mockResolvedValue([]);
      sells.aggregate.mockResolvedValue([]);
      invoiceQuery.limit.mockResolvedValue([
        { toObject: () => ({ ...due, TotalAmount: 0, ProfitMargin: 0 }) },
      ]);
      const result = await service.getDashboardStatsData(
        asWholesaler ? wholesaler : admin,
      );
      const scope = asWholesaler ? { WholeSalerId: 'owner' } : {};
      expect(invoices.find).toHaveBeenCalledWith(scope);
      expect(invoices.countDocuments).toHaveBeenCalledWith(
        expect.objectContaining({
          ...scope,
          CreatedDate: expect.objectContaining({
            $gte: expect.any(String),
            $lt: expect.any(String),
          }),
        }),
      );
      for (const [pipeline] of [
        ...invoices.aggregate.mock.calls,
        ...sells.aggregate.mock.calls,
      ]) {
        expect(pipeline.find((stage) => stage.$match).$match).toEqual(
          expect.objectContaining(scope),
        );
      }
      if (asWholesaler) {
        expect(Object.keys(result.Data).sort()).toEqual([
          'RecentInvoiceData',
          'ThisMonthTotalInvoice',
          'TotalDueAmount',
        ]);
        expect(result.Data.RecentInvoiceData[0]).not.toHaveProperty(
          'ProfitMargin',
        );
      } else {
        expect(result.Data).toHaveProperty('ThisMonthRevenue', 0);
        expect(result.Data.RecentInvoiceData[0].ProfitMargin).toBe(100);
      }
    },
  );

  it('reads aggregated revenue, sales and due totals', async () => {
    invoices.aggregate
      .mockResolvedValueOnce([{ totalRevenue: 300 }])
      .mockResolvedValueOnce([{ totalDueAmount: 80 }]);
    sells.aggregate.mockResolvedValue([{ totalSell: 5 }]);
    expect(await service.getThisMonthRevenue()).toBe(300);
    expect(await service.getTotalDueAmount()).toBe(80);
    expect(await service.getThisMonthTotalSold()).toBe(5);
  });
});
