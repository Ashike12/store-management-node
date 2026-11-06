/* eslint-disable @typescript-eslint/no-var-requires */
const {
  endpoints: salesEndpoints,
  seedSalesTracking,
} = require('../scripts/seed-sales-tracking.cjs');

describe('sales tracking permissions', () => {
  it('seeds admin mappings in both permission collections and indexes', async () => {
    const rows = new Map();
    const indexes = [];
    const db = {
      collection: (name) => ({
        updateOne: async (filter, update) =>
          rows.set(`${name}${JSON.stringify(filter)}`, update.$set),
        createIndex: async (keys) => indexes.push({ name, keys }),
      }),
    };

    await seedSalesTracking(db);
    await seedSalesTracking(db);

    expect(rows.size).toBe(salesEndpoints.length * 2);
    for (const row of rows.values()) expect(row.RoleName).toBe('admin');
    expect(indexes).toEqual(
      expect.arrayContaining([
        {
          name: 'invoices',
          keys: { SoldByUserId: 1, CreatedDate: -1, _id: -1 },
        },
        {
          name: 'invoices',
          keys: { InvoiceType: 1, CreatedDate: -1, _id: -1 },
        },
      ]),
    );
  });
});
