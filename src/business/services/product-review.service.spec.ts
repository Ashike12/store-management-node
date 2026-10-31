import { ProductReviewService } from './product-review.service';

describe('ProductReviewService', () => {
  const query = {
    sort: jest.fn(),
    skip: jest.fn(),
    limit: jest.fn(),
    select: jest.fn(),
    lean: jest.fn(),
  };
  const reviews = {
    find: jest.fn(),
    exists: jest.fn(),
    countDocuments: jest.fn(),
    aggregate: jest.fn(),
    create: jest.fn(),
  };
  const products = { exists: jest.fn(), updateOne: jest.fn() };
  const config = { get: jest.fn() };
  let service: ProductReviewService;

  beforeEach(() => {
    jest.resetAllMocks();
    query.sort.mockReturnValue(query);
    query.skip.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    query.select.mockReturnValue(query);
    query.lean.mockResolvedValue([]);
    reviews.find.mockReturnValue(query);
    reviews.exists.mockResolvedValue(null);
    reviews.countDocuments.mockResolvedValue(0);
    reviews.aggregate.mockResolvedValue([]);
    reviews.create.mockImplementation(async (value) => value);
    products.exists.mockResolvedValue({ _id: 'product-1' });
    config.get.mockReturnValue('false');
    service = new ProductReviewService(
      reviews as any,
      products as any,
      { getUid: () => 'review-1' } as any,
      config as any,
    );
  });

  it('creates a text review and updates the product aggregate', async () => {
    reviews.aggregate.mockResolvedValueOnce([
      { AverageRating: 4.5, ReviewCount: 2 },
    ]);
    const result = await service.create(
      {
        ProductId: 'product-1',
        Rating: 5,
        Comment: ' Very useful product. ',
      },
      {
        _id: 'customer-1',
        DisplayName: 'Customer',
        Roles: ['customer', 'appuser'],
      } as any,
    );

    expect(reviews.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ReviewerName: 'Customer',
        UserId: 'customer-1',
        Comment: 'Very useful product.',
        MediaUrls: [],
      }),
    );
    expect(products.updateOne).toHaveBeenCalledWith(
      { _id: 'product-1' },
      { $set: { AverageRating: 4.5, ReviewCount: 2 } },
    );
    expect(result.Data).toEqual(expect.objectContaining({ ReviewCount: 2 }));
  });

  it('rejects media while the server feature flag is disabled', async () => {
    await expect(
      service.create(
        {
          ProductId: 'product-1',
          Rating: 5,
          Comment: 'Very useful product.',
          MediaUrls: ['https://example.com/review.jpg'],
        },
        {
          _id: 'customer-1',
          DisplayName: 'Customer',
          Roles: ['customer'],
        } as any,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(reviews.create).not.toHaveBeenCalled();
  });

  it('prevents one customer from reviewing the same product twice', async () => {
    reviews.exists.mockResolvedValue({ _id: 'existing-review' });

    await expect(
      service.create(
        {
          ProductId: 'product-1',
          Rating: 4,
          Comment: 'Already reviewed.',
        },
        {
          _id: 'customer-1',
          DisplayName: 'Customer',
          Roles: ['customer'],
        } as any,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(reviews.create).not.toHaveBeenCalled();
  });

  it('rejects review creation from a non-customer account', async () => {
    await expect(
      service.create(
        {
          ProductId: 'product-1',
          Rating: 4,
          Comment: 'Admin review.',
        },
        {
          _id: 'admin-1',
          DisplayName: 'Admin',
          Roles: ['admin'],
        } as any,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(products.exists).not.toHaveBeenCalled();
  });

  it('returns paginated reviews with rating distribution and media flag', async () => {
    query.lean.mockResolvedValue([
      {
        _id: 'review-1',
        ReviewerName: 'Customer',
        Rating: 5,
        Comment: 'Excellent',
        MediaUrls: ['https://example.com/review.jpg'],
        CreatedDate: '2026-10-31T00:00:00.000Z',
      },
    ]);
    reviews.countDocuments.mockResolvedValue(2);
    reviews.aggregate.mockResolvedValue([
      { _id: 5, Count: 1 },
      { _id: 4, Count: 1 },
    ]);

    const result = await service.list({
      ProductId: 'product-1',
      Page: 1,
      Size: 10,
    });

    expect(result.Summary).toEqual(
      expect.objectContaining({
        AverageRating: 4.5,
        ReviewCount: 2,
        MediaEnabled: false,
      }),
    );
    expect(result.Data[0].MediaUrls).toEqual([]);
  });
});
