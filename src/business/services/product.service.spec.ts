import { ProductService } from './product.service';

describe('ProductService with isolated persistence', () => {
  const model = {
    findOne: jest.fn(),
    create: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findByIdAndDelete: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
    updateOne: jest.fn(),
    db: { startSession: jest.fn() },
  };
  const session = {
    withTransaction: jest.fn((callback) => callback()),
    endSession: jest.fn(),
  };
  const inventory = {
    createBatch: jest.fn(),
    findRequestBatches: jest.fn(),
    hasBatches: jest.fn(),
  };
  const query = { limit: jest.fn(), skip: jest.fn() };
  const product = {
    RequestId: 'request-create-1',
    _id: 'product-1',
    ProductName: 'Net',
    Category: 'MosquitoNet',
    SubCategory: 'Double',
    NetHeight: '5',
    Description: 'Test',
    ImageLinks: ['https://example.com/net.jpg'],
    VideoLink: '',
    MakingPrice: 100,
    WholeSalerPrice: 150,
    EndUserPrice: 200,
    EndUserDiscountedPrice: 180,
    Quantity: 10,
  };
  let service: ProductService;
  const admin = { _id: 'admin-1', Roles: ['admin'] } as any;
  beforeEach(() => {
    for (const mock of Object.values(model)) {
      if (typeof mock === 'function' && 'mockReset' in mock) mock.mockReset();
    }
    model.findOne.mockResolvedValue(null);
    model.find.mockReturnValue(query);
    model.countDocuments.mockResolvedValue(1);
    model.db.startSession.mockResolvedValue(session);
    model.create.mockResolvedValue([{ _id: 'generated-id' }]);
    model.updateOne.mockResolvedValue({ matchedCount: 1 });
    session.withTransaction.mockImplementation((callback) => callback());
    inventory.createBatch.mockReset().mockResolvedValue({ BatchId: 'batch-1' });
    inventory.findRequestBatches.mockReset().mockResolvedValue([]);
    inventory.hasBatches.mockReset().mockResolvedValue(false);
    query.limit.mockReset().mockReturnValue(query);
    query.skip.mockReset().mockResolvedValue([product]);
    service = new ProductService(
      model as any,
      {} as any,
      {} as any,
      {} as any,
      { getUid: () => 'generated-id' } as any,
      inventory as any,
    );
  });
  it('creates all product fields including optional empty video and access roles', async () => {
    await service.createProduct(product, admin);
    expect(model.create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          ProductName: product.ProductName,
          CreationRequestId: product.RequestId,
          _id: 'generated-id',
          RolesAllowedToRead: ['admin'],
          RolesAllowedToWrite: ['admin'],
          RolesAllowedToUpdate: ['admin'],
        }),
      ],
      { session },
    );
    expect(inventory.createBatch).toHaveBeenCalledWith(
      'generated-id',
      10,
      'admin-1',
      product.RequestId,
      session,
    );
  });
  it('rejects duplicate product identity', async () => {
    model.findOne.mockImplementation((filter) =>
      filter.CreationRequestId ? null : Promise.resolve(product),
    );
    await expect(service.createProduct(product, admin)).rejects.toThrow(
      'Same product already exists',
    );
    expect(model.create).not.toHaveBeenCalled();
  });
  it.each([{ Category: 'invalid' }, { SubCategory: 'invalid' }])(
    'rejects an invalid category combination',
    async (fields) => {
      await expect(
        service.createProduct({ ...product, ...fields }, admin),
      ).rejects.toThrow();
      expect(model.create).not.toHaveBeenCalled();
    },
  );
  it('updates explicit empty values but rejects direct stock changes', async () => {
    model.findOne.mockResolvedValue(product);
    await service.updateProduct({
      ...product,
      ItemId: 'product-1',
      Quantity: 10,
      VideoLink: '',
      ImageLinks: [],
    });
    expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
      'product-1',
      expect.objectContaining({ VideoLink: '', ImageLinks: [] }),
      { new: true, runValidators: true },
    );
    expect(model.findByIdAndUpdate.mock.calls[0][1]).not.toHaveProperty(
      'Quantity',
    );
    await expect(
      service.updateProduct({ ItemId: 'product-1', Quantity: 11 } as any),
    ).rejects.toThrow('use AddProduction');
  });
  it('rejects an update of a missing product', async () => {
    await expect(
      service.updateProduct({ ItemId: 'missing' } as any),
    ).rejects.toThrow('No Data found');
    expect(model.findByIdAndUpdate).not.toHaveBeenCalled();
  });
  it('deletes an existing product', async () => {
    model.findOne.mockResolvedValue(product);
    await service.deleteById('product-1');
    expect(model.findByIdAndDelete).toHaveBeenCalledWith('product-1');
  });
  it('preserves traceability by blocking deletion when batches exist', async () => {
    model.findOne.mockResolvedValue(product);
    inventory.hasBatches.mockResolvedValue(true);
    await expect(service.deleteById('product-1')).rejects.toThrow(
      'inventory history',
    );
    expect(model.findByIdAndDelete).not.toHaveBeenCalled();
  });
  it('rejects deletion of a missing product', async () => {
    await expect(service.deleteById('missing')).rejects.toThrow(
      'Data not found',
    );
    expect(model.findByIdAndDelete).not.toHaveBeenCalled();
  });
  it('combines pagination, category, search and making-price filters', async () => {
    await service.getProduct({ size: '10', page: '2' }, {
      Category: 'MosquitoNet',
      SubCategory: 'Double',
      MinMakingPrice: 50,
      MaxMakingPrice: 200,
      SearchTerm: 'net.*',
    } as any);
    const filter = model.find.mock.calls[0][0];
    expect(filter).toEqual(
      expect.objectContaining({
        Category: 'MosquitoNet',
        SubCategory: 'Double',
        MakingPrice: { $gte: 50, $lte: 200 },
      }),
    );
    expect(filter.$or[0].ProductName.test('net.*')).toBe(true);
    expect(filter.$or[0].ProductName.test('net anything')).toBe(false);
    expect(model.countDocuments).toHaveBeenCalledWith(filter);
    expect(query.limit).toHaveBeenCalledWith(10);
    expect(query.skip).toHaveBeenCalledWith(10);
  });
  it('does not apply category restrictions for ALL', async () => {
    await service.getProduct({ size: '10', page: '1' }, {
      Category: 'ALL',
      SubCategory: 'ALL',
    } as any);
    expect(model.find).toHaveBeenCalledWith({});
  });
  it('keeps wholesale and making prices out of the public response', async () => {
    query.skip.mockResolvedValueOnce([
      {
        ...product,
        QrVerificationEnabled: true,
        QrVerificationToken: 'private-opaque-token',
      },
    ]);
    const response = JSON.stringify(
      await service.getClientProduct({ size: '10' }, {} as any),
    );
    expect(response).not.toContain('WholeSalerPrice');
    expect(response).not.toContain('MakingPrice');
    expect(response).not.toContain('private-opaque-token');
    expect(response).not.toContain('QrVerification');
    expect(response).toContain('EndUserDiscountedPrice');
    const admin = JSON.stringify(
      await service.getProduct({ size: '10' }, {} as any),
    );
    expect(admin).toContain('WholeSalerPrice');
    expect(admin).toContain('MakingPrice');
  });
  it('enables, disables and rotates an opaque product QR token', async () => {
    const originalClientUrl = process.env.PUBLIC_CLIENT_URL;
    process.env.PUBLIC_CLIENT_URL = 'https://shop.example.com/';
    model.findOne.mockResolvedValue(product);

    const enabled = await service.configureQrVerification({
      ItemId: 'product-1',
      Action: 'enable',
    });
    const firstUpdate = model.findByIdAndUpdate.mock.calls[0][1];
    expect(firstUpdate.QrVerificationEnabled).toBe(true);
    expect(firstUpdate.QrVerificationToken).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(enabled.Data.QrVerificationUrl).toBe(
      `https://shop.example.com/verify-product/${firstUpdate.QrVerificationToken}`,
    );

    model.findOne.mockResolvedValue({
      ...product,
      QrVerificationEnabled: true,
      QrVerificationToken: firstUpdate.QrVerificationToken,
    });
    const disabled = await service.configureQrVerification({
      ItemId: 'product-1',
      Action: 'disable',
    });
    expect(model.findByIdAndUpdate.mock.calls[1][1]).toEqual({
      QrVerificationEnabled: false,
      QrVerificationToken: firstUpdate.QrVerificationToken,
    });
    expect(disabled.Data.QrVerificationUrl).toBeNull();

    await service.configureQrVerification({
      ItemId: 'product-1',
      Action: 'rotate',
    });
    expect(model.findByIdAndUpdate.mock.calls[2][1].QrVerificationToken).not.toBe(
      firstUpdate.QrVerificationToken,
    );

    if (originalClientUrl === undefined) delete process.env.PUBLIC_CLIENT_URL;
    else process.env.PUBLIC_CLIENT_URL = originalClientUrl;
  });
  it('returns only public product identity for an enabled QR code', async () => {
    model.findOne.mockResolvedValue({
      ...product,
      QrVerificationEnabled: true,
      QrVerificationToken: 'opaque-token',
    });
    const response = await service.verifyProductQr('opaque-token');
    expect(model.findOne).toHaveBeenCalledWith({
      QrVerificationToken: 'opaque-token',
      QrVerificationEnabled: true,
    });
    expect(response.Data).toEqual({
      ProductName: 'Net',
      ImageUrl: 'https://example.com/net.jpg',
    });
    expect(JSON.stringify(response)).not.toContain('Price');
    expect(JSON.stringify(response)).not.toContain('Serial');
  });
  it('does not verify disabled, stale or unknown QR codes', async () => {
    model.findOne.mockResolvedValue(null);
    await expect(service.verifyProductQr('unknown-token')).rejects.toThrow(
      'Product verification code not found',
    );
  });
  it('rejects QR management for a missing product', async () => {
    model.findOne.mockResolvedValue(null);
    await expect(
      service.configureQrVerification({
        ItemId: 'missing',
        Action: 'enable',
      }),
    ).rejects.toThrow('Product not found');
  });
  it('increments production atomically and creates an immutable batch', async () => {
    await service.addProduction(
      {
        RequestId: 'production-request-1',
        ProductionInfo: [{ ProductId: 'product-1', Quantity: 20 }],
      },
      admin,
    );
    expect(model.updateOne).toHaveBeenCalledWith(
      { _id: 'product-1' },
      { $inc: { Quantity: 20 } },
      { session, runValidators: true },
    );
    expect(inventory.createBatch).toHaveBeenCalledWith(
      'product-1',
      20,
      'admin-1',
      'production-request-1',
      session,
    );
  });
});
