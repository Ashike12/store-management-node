import { ClientOrderService } from './client-order.service';

describe('Custom mosquito net server pricing through checkout', () => {
  const products = { find: jest.fn() };
  const orders = { create: jest.fn() };
  let service: ClientOrderService;
  const catalog = [
    {
      _id: 'yard',
      Category: 'MosquitoNetYard',
      SubCategory: 'Bonafide',
      ProductName: 'yard',
      NetHeight: '5',
      EndUserDiscountedPrice: 36,
    },
    {
      _id: 'topper',
      Category: 'MosquitoNetYard',
      SubCategory: 'Shaha',
      ProductName: 'topper',
      NetHeight: '6',
      EndUserDiscountedPrice: 72,
    },
    {
      _id: 'cloth',
      Category: 'Others',
      SubCategory: 'MosquitoNetBelowCloth',
      ProductName: 'cloth',
      EndUserDiscountedPrice: 36,
    },
    {
      _id: 'fita',
      Category: 'Others',
      SubCategory: 'Fita',
      ProductName: 'fita',
      EndUserDiscountedPrice: 50,
    },
    {
      _id: 'thread',
      Category: 'Others',
      SubCategory: 'SutarBobin',
      ProductName: 'thread',
      EndUserDiscountedPrice: 20,
    },
  ];
  const options = {
    LeftWidthInch: '72',
    RightWidthInch: '72',
    LeftLengthInch: '84',
    RightLengthInch: '84',
    MosquitoNetYardId: 'yard',
    IncludeBelowCloth: 'false',
    IncludeTopperNet: 'false',
    TopperDirection: 'width',
    TopHeightInch: '3',
    BelowHeightInch: '8',
    KuchiStyle: '4side',
    KuchiCount: '4',
    KuchiGapInch: '12',
    FitaId: 'fita',
    FitaStyle: '2:1',
    SutarBobinId: 'thread',
  };
  const dto = (overrides = {}, price = 864) =>
    ({
      CustomerName: 'Test',
      PhoneNumber: '01700000000',
      Division: 'Dhaka',
      District: 'Dhaka',
      Area: 'Test',
      PostCode: '1200',
      Address: 'Test',
      DeliveryZone: 'inside_dhaka',
      CaptchaToken: 'test',
      Items: [
        {
          ProductId: 'custom-mosquito-net-test',
          ProductName: 'Custom net',
          Category: 'Custom',
          SubCategory: 'Mosquito Net',
          ImageLinks: [],
          UnitPrice: price,
          Quantity: 1,
          CustomOptions: { ...options, ...overrides },
        },
      ],
    }) as any;
  beforeEach(() => {
    products.find.mockReset().mockResolvedValue(catalog);
    orders.create.mockReset();
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    } as any);
    service = new ClientOrderService(
      { getUid: () => 'order-1' } as any,
      {
        get: (key) =>
          key === 'GOOGLE_RECAPTCHA_SECRET_KEY' ? 'test' : undefined,
      } as any,
      orders as any,
      products as any,
    );
  });
  afterEach(() => jest.restoreAllMocks());
  const savedItem = () => orders.create.mock.calls[0][0].Items[0];
  it('converts five feet to 60 inches, charges two 12-yard fita rolls, and adds labour', async () => {
    // Boundary: 312 + 4*8*2 = 376; topper: ceil(72/60)*84 = 168.
    // Price: 376 + 168 + 2*50 + 20 + 200 = 864; shipping is separate.
    await service.createOrder(dto());
    expect(savedItem()).toEqual(
      expect.objectContaining({
        UnitPrice: 864,
        CustomOptions: expect.objectContaining({
          ServerCalculatedFitaLengthInch: '540',
          ServerCalculatedFitaRoll: '2',
          ServerCalculatedBoundaryNetInch: '376',
          ServerCalculatedTopperNetInch: '168',
        }),
      }),
    );
    expect(orders.create.mock.calls[0][0].TotalAmount).toBe(944);
  });
  it('calculates gap kuchi using the perimeter', async () => {
    await service.createOrder(dto({ KuchiStyle: 'gap' }, 854));
    expect(savedItem().CustomOptions.ServerCalculatedBoundaryNetInch).toBe(
      '366',
    );
  });
  it('prices optional below cloth by yard and strip count', async () => {
    await service.createOrder(
      dto({ IncludeBelowCloth: 'true', BelowClothId: 'cloth' }, 1052),
    );
    expect(savedItem().UnitPrice).toBe(1052);
  });
  it('prices a different topper with its own catalog price', async () => {
    await service.createOrder(
      dto({ IncludeTopperNet: 'true', TopperNetYardId: 'topper' }, 1032),
    );
    expect(savedItem().UnitPrice).toBe(1032);
  });
  it('supports length-direction topper calculation', async () => {
    await service.createOrder(dto({ TopperDirection: 'length' }, 840));
    expect(savedItem().CustomOptions.ServerCalculatedTopperNetInch).toBe('144');
  });
  it.each([0, 1, 860, 900])(
    'rejects a tampered price %s without creating an order',
    async (price) => {
      await expect(service.createOrder(dto({}, price))).rejects.toMatchObject({
        status: 400,
      });
      expect(orders.create).not.toHaveBeenCalled();
    },
  );
  it('rejects a one taka submitted price difference', async () => {
    await expect(service.createOrder(dto({}, 863))).rejects.toMatchObject({
      status: 400,
    });
    expect(orders.create).not.toHaveBeenCalled();
  });
  it.each([
    { LeftWidthInch: '' },
    { LeftWidthInch: '0' },
    { RightLengthInch: '-1' },
    { LeftLengthInch: 'Infinity' },
    { KuchiStyle: 'invalid' },
    { TopperDirection: 'invalid' },
    { FitaStyle: '0:1' },
    { IncludeBelowCloth: 'true' },
    { IncludeTopperNet: 'true' },
    { MosquitoNetYardId: 'missing' },
    { FitaId: 'missing' },
    { SutarBobinId: 'missing' },
  ])('rejects invalid options %j', async (overrides) => {
    await expect(service.createOrder(dto(overrides))).rejects.toMatchObject({
      status: 400,
    });
    expect(orders.create).not.toHaveBeenCalled();
  });
  it.each([
    { width: 60, length: 64, rolls: 1, price: 646 },
    { width: 60, length: 65, rolls: 2, price: 699 },
    { width: 120, length: 128, rolls: 2, price: 1136 },
    { width: 120, length: 129, rolls: 3, price: 1190 },
  ])(
    'rounds fita rolls at the 432-inch boundary: %j',
    async ({ width, length, rolls, price }) => {
      await service.createOrder(
        dto(
          {
            LeftWidthInch: String(width),
            RightWidthInch: String(width),
            LeftLengthInch: String(length),
            RightLengthInch: String(length),
          },
          price,
        ),
      );
      expect(savedItem().CustomOptions.ServerCalculatedFitaRoll).toBe(
        String(rolls),
      );
    },
  );

  it.each(['custom-window-net-1', 'custom-unknown-1'])(
    'rejects unsupported custom ID %s even with mosquito marker',
    async (id) => {
      const input = dto({ BuildCalculationType: 'MosquitoNet' });
      input.Items[0].ProductId = id;
      await expect(service.createOrder(input)).rejects.toMatchObject({
        status: 400,
      });
      expect(orders.create).not.toHaveBeenCalled();
    },
  );
  it.each([
    { IncludeBelowCloth: 'yes' },
    { IncludeTopperNet: true },
    { LeftWidthInch: 72 },
    { LeftWidthInch: {} },
    { LeftWidthInch: '0x48' },
    { LeftWidthInch: '1e2' },
    { LeftWidthInch: '1201' },
    { FitaStyle: '1:1:999' },
    { FitaStyle: '0.5:1' },
    { FitaStyle: '99:1' },
    { KuchiCount: '3' },
    { KuchiCount: '11' },
    { KuchiCount: '4.5' },
    { KuchiGapInch: '1' },
    { KuchiGapInch: '13' },
    { KuchiGapInch: '2.5' },
    { BuildCalculationType: 'WindowNet' },
    { BuildType: 'Window Net' },
  ])('rejects malformed or forbidden builder setting %j', async (overrides) => {
    await expect(service.createOrder(dto(overrides))).rejects.toMatchObject({
      status: 400,
    });
    expect(orders.create).not.toHaveBeenCalled();
  });
  it.each(['yard', 'topper', 'cloth', 'fita', 'thread'])(
    'rejects wrong material category for %s',
    async (id) => {
      products.find.mockResolvedValue(
        catalog.map((p) =>
          p._id === id
            ? { ...p, Category: 'MosquitoNet', SubCategory: 'Double' }
            : p,
        ),
      );
      await expect(
        service.createOrder(
          dto({
            IncludeTopperNet: 'true',
            TopperNetYardId: 'topper',
            IncludeBelowCloth: 'true',
            BelowClothId: 'cloth',
          }),
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(orders.create).not.toHaveBeenCalled();
    },
  );
  it.each([undefined, '', '0', '-1', 'Infinity', 'NaN', '1e2', '101'])(
    'rejects invalid database net height %s',
    async (NetHeight) => {
      products.find.mockResolvedValue(
        catalog.map((p) => (p._id === 'yard' ? { ...p, NetHeight } : p)),
      );
      await expect(service.createOrder(dto())).rejects.toMatchObject({
        status: 400,
      });
      expect(orders.create).not.toHaveBeenCalled();
    },
  );
  it.each([undefined, 0, -1, NaN, Infinity, '36', 10000001])(
    'rejects invalid material price %s',
    async (price) => {
      products.find.mockResolvedValue(
        catalog.map((p) =>
          p._id === 'fita' ? { ...p, EndUserDiscountedPrice: price } : p,
        ),
      );
      await expect(service.createOrder(dto())).rejects.toMatchObject({
        status: 400,
      });
      expect(orders.create).not.toHaveBeenCalled();
    },
  );
  it('rebuilds fulfillment details instead of trusting submitted display metadata', async () => {
    const input = dto({
      LeftWidth: '999 inch',
      MosquitoNetYard: 'Expensive fabric',
      AdminInstruction: 'free extras',
      ServerCalculatedPrice: '1',
    });
    input.Items[0].ImageLinks = ['https://attacker.invalid/fake'];
    input.Items[0].ProductName = 'Fake';
    await service.createOrder(input);
    expect(savedItem().ProductName).toBe('Custom Mosquito Net');
    expect(savedItem().ImageLinks).toEqual([]);
    expect(savedItem().CustomOptions).toEqual(
      expect.objectContaining({
        LeftWidth: '72 inch',
        MosquitoNetYard: 'yard',
        ServerCalculatedPrice: '864',
      }),
    );
    expect(savedItem().CustomOptions).not.toHaveProperty('AdminInstruction');
  });
});
