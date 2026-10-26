/* eslint-disable @typescript-eslint/no-var-requires */
export {};
const { seedProductQr, endpoints } = require('../scripts/seed-product-qr.cjs');

describe('BE-109 product QR permission and uniqueness seed', () => {
  it('replays endpoint maps for both collections and creates a unique token index', async () => {
    const rows = new Map();
    const indexes = [];
    const db = {
      collection: (name) => ({
        updateOne: async (filter, update) =>
          rows.set(name + JSON.stringify(filter), update.$set),
        createIndex: async (keys, options) =>
          indexes.push({ name, keys, options }),
      }),
    };

    await seedProductQr(db);
    await seedProductQr(db);

    const roleCount = endpoints.reduce(
      (count, endpoint) => count + endpoint.roles.length,
      0,
    );
    expect(rows.size).toBe(roleCount * 2);
    expect(
      [...rows.values()].find(
        (row) =>
          row.FeatureId === 'ConfigureProductQr' && row.RoleName === 'admin',
      ),
    ).toBeDefined();
    expect(
      [...rows.values()].filter(
        (row) => row.FeatureId === 'ConfigureProductQr',
      ),
    ).toHaveLength(2);
    expect(indexes).toEqual(
      expect.arrayContaining([
        {
          name: 'products',
          keys: { QrVerificationToken: 1 },
          options: {
            unique: true,
            partialFilterExpression: {
              QrVerificationToken: { $type: 'string' },
            },
          },
        },
      ]),
    );
  });
});
