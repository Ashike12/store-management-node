import { InvoiceService } from './invoice.service';

describe('InvoiceService accounting and ownership baseline', () => {
  const invoices = {
    create: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
    findOne: jest.fn(),
    findByIdAndDelete: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    aggregate: jest.fn(),
  };
  const sells = {
    insertMany: jest.fn(),
    find: jest.fn(),
    deleteMany: jest.fn(),
    aggregate: jest.fn(),
  };
  const products = { findOne: jest.fn() };
  const users = { findOne: jest.fn() };
  const productService = { updateProduct: jest.fn() };
  const query = { sort: jest.fn(), limit: jest.fn(), skip: jest.fn() };
  let service: InvoiceService;
  const due = {
    InvoiceType: 'DUE_PAYMENT',
    PaymentAmount: 100,
    WholeSalerId: 'owner',
    ProductSellInfo: [],
  };
  beforeEach(() => {
    for (const group of [
      invoices,
      sells,
      products,
      users,
      productService,
      query,
    ])
      for (const fn of Object.values(group)) fn.mockReset();
    users.findOne.mockResolvedValue({
      _id: 'owner',
      FirstName: 'Test',
      LastName: 'User',
    });
    invoices.find.mockReturnValue(query);
    query.sort.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    query.skip.mockResolvedValue([
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
    service = new InvoiceService(
      products as any,
      sells as any,
      invoices as any,
      users as any,
      { getUid: () => 'invoice-1' } as any,
      productService as any,
    );
  });
  it('records due payment totals without touching stock or product sales', async () => {
    await service.createInvoice(due);
    expect(invoices.create).toHaveBeenCalledWith(
      expect.objectContaining({
        TotalAmount: 100,
        PaymentAmount: 100,
        ProfitMargin: 100,
        InvoiceType: 'DUE_PAYMENT',
      }),
    );
    expect(sells.insertMany).not.toHaveBeenCalled();
    expect(productService.updateProduct).not.toHaveBeenCalled();
  });
  it('requires products for a consumer invoice', async () => {
    await expect(
      service.createInvoice({ ...due, InvoiceType: 'CONSUMER' }),
    ).rejects.toThrow('At least one product');
    expect(invoices.create).not.toHaveBeenCalled();
  });
  it('requires a wholesaler for a due payment', async () => {
    await expect(
      service.createInvoice({ ...due, WholeSalerId: '' }),
    ).rejects.toThrow('Wholesaler is required');
  });
  it('rejects an unknown wholesaler', async () => {
    users.findOne.mockResolvedValue(null);
    await expect(service.createInvoice(due)).rejects.toThrow(
      'Wholesaler not found',
    );
  });
  it('forces wholesaler ownership even when another owner is requested', async () => {
    const result = await service.getInvoiceList(
      { size: '10', page: '1' },
      { ItemId: '', WholesalerId: 'other' },
      { _id: 'owner', Roles: ['wholesaler'] } as any,
    );
    expect(invoices.find).toHaveBeenCalledWith({ WholeSalerId: 'owner' });
    expect(invoices.countDocuments).toHaveBeenCalledWith({
      WholeSalerId: 'owner',
    });
    expect(result.Data[0]).not.toHaveProperty('ProfitMargin');
  });
  it('scopes invoice details to the logged-in wholesaler', async () => {
    query.skip.mockResolvedValue([]);
    await expect(
      service.getInvoiceList({ size: '10' }, { ItemId: 'other-invoice' }, {
        _id: 'owner',
        Roles: ['wholesaler'],
      } as any),
    ).rejects.toThrow('Data not found');
    expect(invoices.find).toHaveBeenCalledWith({
      _id: 'other-invoice',
      WholeSalerId: 'owner',
    });
    expect(sells.find).not.toHaveBeenCalled();
  });
  it('keeps profit visible in admin results', async () => {
    const result = await service.getInvoiceList(
      { size: '10' },
      { ItemId: '' },
      { Roles: ['admin'] } as any,
    );
    expect(result.Data[0].ProfitMargin).toBe(100);
  });
  it('rejects deleting a nonexistent invoice', async () => {
    invoices.findOne.mockResolvedValue(null);
    await expect(service.deleteInvoiceById('missing')).rejects.toThrow(
      'Data not found',
    );
    expect(invoices.findByIdAndDelete).not.toHaveBeenCalled();
  });
  it('creates product sales using supplied sale price and reduces stock', async () => {
    products.findOne.mockResolvedValue({
      ProductName: 'Net',
      MakingPrice: 100,
      Quantity: 10,
    });
    await service.createInvoice({
      InvoiceType: 'CONSUMER',
      WholeSalerId: '',
      PaymentAmount: 300,
      ProductSellInfo: [{ ProductId: 'net', SellingPrice: 150, Quantity: 2 }],
    });
    expect(productService.updateProduct).toHaveBeenCalledWith({
      ItemId: 'net',
      Quantity: 8,
    });
    expect(invoices.create).toHaveBeenCalledWith(
      expect.objectContaining({
        TotalAmount: 300,
        PaymentAmount: 300,
        ProfitMargin: 100,
      }),
    );
    expect(sells.insertMany).toHaveBeenCalledWith([
      expect.objectContaining({
        ProductId: 'net',
        Quantity: 2,
        SellingPrice: 150,
      }),
    ]);
  });
  it('restores previous sold quantity before applying an invoice edit', async () => {
    invoices.findOne.mockResolvedValue({ _id: 'invoice-1' });
    sells.find.mockResolvedValue([{ ProductId: 'net', Quantity: 2 }]);
    products.findOne
      .mockResolvedValueOnce({ Quantity: 8 })
      .mockResolvedValueOnce({
        ProductName: 'Net',
        Quantity: 10,
        MakingPrice: 100,
      });
    await service.updateInvoice({
      ItemId: 'invoice-1',
      InvoiceType: 'CONSUMER',
      WholeSalerId: '',
      PaymentAmount: 450,
      ProductSellInfo: [
        {
          ItemId: 'old-sale',
          ProductId: 'net',
          Quantity: 3,
          SellingPrice: 150,
        },
      ],
    });
    expect(productService.updateProduct).toHaveBeenNthCalledWith(1, {
      ItemId: 'net',
      Quantity: 10,
    });
    expect(productService.updateProduct).toHaveBeenNthCalledWith(2, {
      ItemId: 'net',
      Quantity: 7,
    });
    expect(sells.deleteMany).toHaveBeenCalledWith({ InvoiceId: 'invoice-1' });
    expect(invoices.findByIdAndUpdate).toHaveBeenCalledWith(
      'invoice-1',
      expect.objectContaining({
        TotalAmount: 450,
        PaymentAmount: 450,
        ProfitMargin: 150,
      }),
      { new: true, runValidators: true },
    );
  });
  it('updates due-payment totals without creating product sales', async () => {
    invoices.findOne.mockResolvedValue({ _id: 'invoice-1' });
    await service.updateInvoice({
      ...due,
      ItemId: 'invoice-1',
      PaymentAmount: 200,
    });
    expect(invoices.findByIdAndUpdate).toHaveBeenCalledWith(
      'invoice-1',
      expect.objectContaining({
        TotalAmount: 200,
        PaymentAmount: 200,
        ProfitMargin: 200,
      }),
      { new: true, runValidators: true },
    );
    expect(sells.insertMany).not.toHaveBeenCalled();
  });
  it('rejects an edit of a missing invoice before touching stock', async () => {
    invoices.findOne.mockResolvedValue(null);
    await expect(
      service.updateInvoice({ ...due, ItemId: 'missing' }),
    ).rejects.toThrow('Invoice not found');
    expect(productService.updateProduct).not.toHaveBeenCalled();
  });
  it.each([{ InvoiceType: 'CONSUMER' }, { WholeSalerId: '' }])(
    'rejects invalid edits before deleting old sales: %j',
    async (overrides) => {
      invoices.findOne.mockResolvedValue({ _id: 'invoice-1' });
      await expect(
        service.updateInvoice({ ...due, ItemId: 'invoice-1', ...overrides }),
      ).rejects.toMatchObject({ status: 400 });
      expect(sells.deleteMany).not.toHaveBeenCalled();
    },
  );
  it('returns safe invoice details to a wholesaler', async () => {
    sells.find.mockResolvedValue([
      {
        _id: 'sale-1',
        InvoiceId: 'invoice-1',
        ProductName: 'Net',
        SellingPrice: 150,
        MakingPrice: 100,
      },
    ]);
    const result = await service.getInvoiceList(
      { size: '10' },
      { ItemId: 'invoice-1' },
      { _id: 'owner', Roles: ['wholesaler'] } as any,
    );
    expect(result.Data).not.toHaveProperty('ProfitMargin');
    expect(result.Data.ProductSellInfo[0]).not.toHaveProperty('MakingPrice');
    expect(result.Data.ProductSellInfo[0].SellingPrice).toBe(150);
  });
  it.each([true, false])(
    'scopes dashboard queries and shapes results for wholesaler=%s',
    async (wholesaler) => {
      invoices.aggregate.mockResolvedValue([]);
      sells.aggregate.mockResolvedValue([]);
      query.limit.mockResolvedValue([
        { toObject: () => ({ ...due, TotalAmount: 0, ProfitMargin: 0 }) },
      ]);
      const result = await service.getDashboardStatsData({
        _id: 'owner',
        Roles: [wholesaler ? 'wholesaler' : 'admin'],
      } as any);
      const scope = wholesaler ? { WholeSalerId: 'owner' } : {};
      expect(invoices.find).toHaveBeenCalledWith(scope);
      expect(invoices.countDocuments).toHaveBeenCalledWith(scope);
      for (const [pipeline] of [
        ...invoices.aggregate.mock.calls,
        ...sells.aggregate.mock.calls,
      ]) {
        expect(pipeline.find((stage) => stage.$match).$match).toEqual(
          expect.objectContaining(scope),
        );
      }
      expect(result.Data.RecentInvoiceData[0].TotalAmount).toBe(100);
      if (wholesaler) {
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
