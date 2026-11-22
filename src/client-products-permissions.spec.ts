/* eslint-disable @typescript-eslint/no-var-requires */
const { endpoint, roles, seedClientProductsAccess } = require('../scripts/seed-client-products-access.cjs');

export {};

describe('client product access permission seed', () => {
  it('seeds both maps for every authenticated role repeatably', async () => {
    const rows = new Map<string, any>();
    const collection = (name: string) => ({
      updateOne: jest.fn(async (filter, update) => {
        rows.set(`${name}:${JSON.stringify(filter)}`, { ...filter, ...update.$set });
      }),
    });
    const db = { collection: jest.fn((name: string) => collection(name)) };

    await seedClientProductsAccess(db);
    await seedClientProductsAccess(db);

    expect(endpoint.route).toBe('business/GetClientProducts');
    expect(rows.size).toBe(roles.length * 2);
    expect(rows.get(`featureendpointmaps:${JSON.stringify({ APIToAccess: endpoint.route, RoleName: 'wholesaler' })}`)).toEqual(
      expect.objectContaining({ FeatureId: 'GetClientProducts', RoleName: 'wholesaler' }),
    );
  });
});
