import { ClientOrderService } from './client-order.service';

describe('ClientOrderService with mocked CAPTCHA and database', () => {
  const orders = { create: jest.fn() };
  const products = { find: jest.fn() };
  const config = { get: jest.fn() };
  const dto = {
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
});
