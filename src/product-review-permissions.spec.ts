/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */
const {
  endpoints,
  seedProductReviews,
} = require('../scripts/seed-product-reviews.cjs');

export {};

describe('product review permission and index seed', () => {
  it('seeds both permission maps and the listing index', async () => {
    const rows = new Map<string, any>();
    const indexes: any[] = [];
    const collection = (name: string) => ({
      deleteMany: jest.fn(),
      updateOne: jest.fn(async (filter, update) => {
        rows.set(`${name}:${JSON.stringify(filter)}`, {
          ...filter,
          ...update.$set,
        });
      }),
      createIndex: jest.fn(async (keys, options) =>
        indexes.push({ name, keys, options }),
      ),
    });

    await seedProductReviews({ collection });

    const expectedMappingCount = endpoints.reduce(
      (total, endpoint) => total + endpoint.allowedRoles.length,
      0,
    );
    expect(
      [...rows.keys()].filter((key) => key.startsWith('featureendpointmaps:')),
    ).toHaveLength(expectedMappingCount);
    expect(
      [...rows.keys()].filter((key) => key.startsWith('featurerolemaps:')),
    ).toHaveLength(expectedMappingCount);
    expect(
      [...rows.values()].filter(
        (row) => row.FeatureId === 'CreateProductReview',
      ),
    ).toEqual([
      expect.objectContaining({ RoleName: 'customer' }),
      expect.objectContaining({ RoleName: 'customer' }),
    ]);
    expect(indexes).toContainEqual(
      expect.objectContaining({
        name: 'productreviews',
        keys: { ProductId: 1, IsDeleted: 1, CreatedDate: -1 },
      }),
    );
    expect(indexes).toContainEqual(
      expect.objectContaining({
        name: 'productreviews',
        keys: { ProductId: 1, UserId: 1 },
        options: { unique: true },
      }),
    );
  });
});
