import { ClientOrderService } from './client-order.service';

describe('ClientOrderService with mocked CAPTCHA and database', () => {
  const orders = {
    create: jest.fn(),
    findOne: jest.fn().mockResolvedValue(null),
  };
  const products = { find: jest.fn() };
  const config = { get: jest.fn() };
  const dto = {
    RequestId: '12345678-1234-4123-8123-123456789abc',
    CustomerName: ' Test ',
    PhoneNumber: '01700000000',
    Division: 'Other',
    District: 'Other',
    Area: 'Area',
    PostCode: '1200',
    Address: 'Address',
    DeliveryZone: 'inside_dhaka',
    CaptchaToken: 'test',
    Items: [
      {
        ProductId: 'net',
        ProductName: 'Client name',
        Category: 'MosquitoNet',
        SubCategory: 'Double',
        ImageLinks: [],
        UnitPrice: 1,
        Quantity: 2,
      },
    ],
  } as any;
  let service: ClientOrderService;
  let fetchMock: jest.SpyInstance;
  beforeEach(() => {
    orders.create.mockReset();
    orders.findOne.mockReset().mockResolvedValue(null);
    products.find
      .mockReset()
      .mockResolvedValue([
        { _id: 'net', ProductName: 'Server name', EndUserDiscountedPrice: 200 },
      ]);
    config.get
      .mockReset()
      .mockImplementation((key) =>
        key === 'GOOGLE_RECAPTCHA_SECRET_KEY' ? 'test-secret' : undefined,
      );
    fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, hostname: 'localhost' }),
    } as any);
    service = new ClientOrderService(
      { getUid: () => 'order-1' } as any,
      config as any,
      orders as any,
      products as any,
    );
  });
  afterEach(() => fetchMock.mockRestore());
  it('uses catalog prices and enforces inside-Dhaka location and delivery fee', async () => {
    await service.createOrder(dto, '127.0.0.1');
    expect(orders.create).toHaveBeenCalledWith(
      expect.objectContaining({
        RequestId: '12345678-1234-4123-8123-123456789abc',
        CustomerName: 'Test',
        Division: 'Dhaka',
        District: 'Dhaka',
        ShippingCost: 80,
        Subtotal: 400,
        TotalAmount: 480,
        Items: [
          expect.objectContaining({
            UnitPrice: 200,
            ProductName: 'Server name',
          }),
        ],
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.google.com/recaptcha/api/siteverify',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('remoteip=127.0.0.1'),
      }),
    );
  });
  it('applies outside-Dhaka shipping and a percentage coupon', async () => {
    await service.createOrder({
      ...dto,
      DeliveryZone: 'outside_dhaka',
      CouponCode: ' off10 ',
    });
    expect(orders.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ShippingCost: 150,
        CouponDiscount: 40,
        TotalAmount: 510,
        Division: 'Other',
      }),
    );
  });
  it.each([0, -1, NaN])(
    'rejects invalid quantity %s before saving',
    async (Quantity) => {
      await expect(
        service.createOrder({ ...dto, Items: [{ ...dto.Items[0], Quantity }] }),
      ).rejects.toThrow('Invalid quantity');
      expect(orders.create).not.toHaveBeenCalled();
    },
  );
  it('rejects missing catalog products', async () => {
    products.find.mockResolvedValue([]);
    await expect(service.createOrder(dto)).rejects.toThrow('Product not found');
    expect(orders.create).not.toHaveBeenCalled();
  });
  it('rejects failed CAPTCHA before querying products', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: false }),
    } as any);
    await expect(service.createOrder(dto)).rejects.toMatchObject({
      status: 400,
    });
    expect(products.find).not.toHaveBeenCalled();
    expect(orders.create).not.toHaveBeenCalled();
  });
  it('reports CAPTCHA upstream failure without saving', async () => {
    fetchMock.mockResolvedValue({ ok: false } as any);
    await expect(service.createOrder(dto)).rejects.toMatchObject({
      status: 503,
    });
    expect(orders.create).not.toHaveBeenCalled();
  });
  it('fails closed when CAPTCHA is not configured', async () => {
    config.get.mockReturnValue(undefined);
    await expect(service.createOrder(dto)).rejects.toMatchObject({
      status: 503,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(orders.create).not.toHaveBeenCalled();
  });

  it.each([undefined, 0, -1, NaN, Infinity, '200', 10000001])(
    'rejects invalid catalog price %s without client fallback',
    async (price) => {
      products.find.mockResolvedValue([
        { _id: 'net', EndUserDiscountedPrice: price },
      ]);
      await expect(service.createOrder(dto)).rejects.toMatchObject({
        status: 400,
      });
      expect(orders.create).not.toHaveBeenCalled();
    },
  );
  it('uses regular database price only when discount price is absent', async () => {
    products.find.mockResolvedValue([{ _id: 'net', EndUserPrice: 250 }]);
    await service.createOrder(dto);
    expect(orders.create.mock.calls[0][0].Items[0].UnitPrice).toBe(250);
  });
  it.each([1.5, 1001, '2', Infinity])(
    'rejects non-integer or unbounded quantity %s',
    async (Quantity) => {
      await expect(
        service.createOrder({ ...dto, Items: [{ ...dto.Items[0], Quantity }] }),
      ).rejects.toMatchObject({ status: 400 });
      expect(orders.create).not.toHaveBeenCalled();
    },
  );
  it('strips arbitrary catalog fulfillment options and submitted images', async () => {
    await service.createOrder({
      ...dto,
      Items: [
        {
          ...dto.Items[0],
          CustomOptions: { material: 'fake' },
          ImageLinks: ['https://attacker.invalid'],
        },
      ],
    });
    expect(orders.create.mock.calls[0][0].Items[0]).toEqual(
      expect.objectContaining({ CustomOptions: {}, ImageLinks: [] }),
    );
  });
  it.each([[[]], [Array(101).fill(dto.Items[0])]])(
    'rejects empty or oversized carts',
    async (Items) => {
      await expect(
        service.createOrder({ ...dto, Items }),
      ).rejects.toMatchObject({ status: 400 });
      expect(orders.create).not.toHaveBeenCalled();
    },
  );

  it('replays the same request without creating or repricing an order', async () => {
    await service.createOrder(dto);
    const saved = orders.create.mock.calls[0][0];
    orders.findOne.mockResolvedValue(saved);
    products.find.mockClear();
    const response = await service.createOrder({
      ...dto,
      CaptchaToken: 'fresh-captcha',
    });
    expect(response.Data.OrderId).toBe(saved._id);
    expect(orders.create).toHaveBeenCalledTimes(1);
    expect(products.find).not.toHaveBeenCalled();
  });
  it('rejects reuse of a request ID for different order data', async () => {
    await service.createOrder(dto);
    orders.findOne.mockResolvedValue(orders.create.mock.calls[0][0]);
    await expect(
      service.createOrder({ ...dto, Address: 'different' }),
    ).rejects.toMatchObject({ status: 409 });
    expect(orders.create).toHaveBeenCalledTimes(1);
  });
  it('resolves a duplicate-key race to the already created order', async () => {
    await service.createOrder(dto);
    const saved = orders.create.mock.calls[0][0];
    orders.create.mockRejectedValueOnce({ code: 11000 });
    orders.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(saved);
    const result = await service.createOrder(dto);
    expect(result.Data.OrderId).toBe(saved._id);
  });

  it('creates a manual unpaid order requiring immediate follow-up even if a client claims paid', async () => {
    const response = await service.createOrder({
      ...dto,
      PhoneNumber: '+880 1700-000000',
      PaymentStatus: 'paid',
      PaymentHandling: 'online',
      RequiresImmediateAction: false,
    });
    expect(orders.create).toHaveBeenCalledWith(
      expect.objectContaining({
        PhoneNumber: '01700000000',
        PaymentStatus: 'unpaid',
        PaymentHandling: 'manual',
        RequiresImmediateAction: true,
      }),
    );
    expect(response.Data).toMatchObject({
      PaymentHandling: 'manual',
      ContactRequired: true,
    });
  });
  it.each([
    '',
    '   ',
    '12345',
    '01200000000',
    '017000000000',
    '017abcdefgh',
    '+441234567890',
    null,
    undefined,
  ])(
    'rejects an invalid contact phone %j before CAPTCHA or persistence',
    async (PhoneNumber) => {
      await expect(
        service.createOrder({ ...dto, PhoneNumber }),
      ).rejects.toMatchObject({ status: 400 });
      expect(orders.create).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it('treats equivalent phone formats as the same retry and does not queue a duplicate alert', async () => {
    await service.createOrder({ ...dto, PhoneNumber: '+8801700000000' });
    const saved = orders.create.mock.calls[0][0];
    orders.findOne.mockResolvedValue(saved);
    const replay = await service.createOrder({
      ...dto,
      PhoneNumber: '01700000000',
    });
    expect(orders.create).toHaveBeenCalledTimes(1);
    expect(replay.Data).toMatchObject({
      PaymentHandling: 'manual',
      ContactRequired: true,
    });
  });
});
