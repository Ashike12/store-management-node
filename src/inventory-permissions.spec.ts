/* eslint-disable @typescript-eslint/no-var-requires */
const {
  seedInventoryBatches,
  endpoints,
} = require('../scripts/seed-inventory-batches.cjs');

describe('BE-110 inventory permission and uniqueness seed', () => {
  it('replays admin-only endpoint maps and required global indexes', async () => {
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
    await seedInventoryBatches(db);
    await seedInventoryBatches(db);
    expect(rows.size).toBe(endpoints.length * 2);
    for (const row of rows.values()) expect(row.RoleName).toBe('admin');
    expect(indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'inventoryitems',
          keys: { SerialNumber: 1 },
          options: { unique: true },
        }),
        expect.objectContaining({
          name: 'inventorybatches',
          keys: { BatchId: 1 },
          options: { unique: true },
        }),
        expect.objectContaining({
          name: 'inventorybatches',
          keys: { RequestId: 1, ProductId: 1 },
          options: { unique: true },
        }),
      ]),
    );
  });
});
