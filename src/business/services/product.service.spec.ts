import { ProductService } from './product.service';

describe('ProductService with isolated persistence', () => {
  const model = {
    findOne: jest.fn(),
    create: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findByIdAndDelete: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
  };
  const query = { limit: jest.fn(), skip: jest.fn() };
  const product = {
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
  beforeEach(() => {
    for (const mock of Object.values(model)) mock.mockReset();
    model.findOne.mockResolvedValue(null);
    model.find.mockReturnValue(query);
    model.countDocuments.mockResolvedValue(1);
    query.limit.mockReset().mockReturnValue(query);
    query.skip.mockReset().mockResolvedValue([product]);
    service = new ProductService(
      model as any,
      {} as any,
      {} as any,
      {} as any,
      { getUid: () => 'generated-id' } as any,
    );
  });
  it('creates all product fields including optional empty video and access roles', async () => {
    await service.createProduct(product);
    expect(model.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ...product,
        _id: 'generated-id',
        RolesAllowedToRead: ['admin'],
        RolesAllowedToWrite: ['admin'],
        RolesAllowedToUpdate: ['admin'],
      }),
    );
  });
  it('rejects duplicate product identity', async () => {
    model.findOne.mockResolvedValue(product);
    await expect(service.createProduct(product)).rejects.toThrow(
      'Same product already exists',
    );
    expect(model.create).not.toHaveBeenCalled();
  });
  it.each([{ Category: 'invalid' }, { SubCategory: 'invalid' }])(
    'rejects an invalid category combination',
    async (fields) => {
      await expect(
        service.createProduct({ ...product, ...fields }),
      ).rejects.toThrow();
      expect(model.create).not.toHaveBeenCalled();
    },
  );
  it('updates explicit zero/empty values rather than dropping them', async () => {
    model.findOne.mockResolvedValue(product);
    await service.updateProduct({
      ...product,
      ItemId: 'product-1',
      Quantity: 0,
      VideoLink: '',
      ImageLinks: [],
    });
    expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
      'product-1',
      expect.objectContaining({ Quantity: 0, VideoLink: '', ImageLinks: [] }),
      { new: true, runValidators: true },
    );
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
    const response = JSON.stringify(
      await service.getClientProduct({ size: '10' }, {} as any),
    );
    expect(response).not.toContain('WholeSalerPrice');
    expect(response).not.toContain('MakingPrice');
    expect(response).toContain('EndUserDiscountedPrice');
    const admin = JSON.stringify(
      await service.getProduct({ size: '10' }, {} as any),
    );
    expect(admin).toContain('WholeSalerPrice');
    expect(admin).toContain('MakingPrice');
  });
  it('characterizes production as quantity replacement, not increment', async () => {
    await service.addProduction({
      ProductionInfo: [{ ProductId: 'product-1', Quantity: 20 }],
    });
    expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
      'product-1',
      { Quantity: 20 },
      { new: true, runValidators: true },
    );
  });
});
