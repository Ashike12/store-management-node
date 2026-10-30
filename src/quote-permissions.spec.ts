import { UserRoles } from './shared/constant/roles.constant';
import { FeatureRoleMapSchema } from './shared/schemas/FeatureRoleMap.schema';
const {
  seedBuilderQuote,
  roles,
} = require('../scripts/seed-builder-quote.cjs');

describe('BE-102 permission seed', () => {
  it('covers every current role and matches the approved schema', () => {
    expect(roles.sort()).toEqual(Object.values(UserRoles).sort());
    for (const field of ['_id', 'FeatureId', 'FeatureName', 'RoleName'])
      expect(FeatureRoleMapSchema.path(field)).toBeDefined();
  });

  it('upserts both collections repeatably without changing unrelated permissions', async () => {
    const records = new Map<string, any>();
    const db = {
      collection: (name: string) => ({
        updateOne: async (filter, update, options) => {
          expect(options).toEqual({ upsert: true });
          const key = name + JSON.stringify(filter);
          records.set(key, {
            ...(records.get(key) || update.$setOnInsert),
            ...update.$set,
          });
        },
      }),
    };
    await seedBuilderQuote(db);
    const first = [...records.entries()];
    await seedBuilderQuote(db);
    expect([...records.entries()]).toEqual(first);
    expect(records.size).toBe(12);
    for (const [key, row] of records) {
      expect(row.FeatureId).toBe('QuoteBuilder');
      expect(roles).toContain(row.RoleName);
      if (key.startsWith('featureendpointmaps'))
        expect(row.APIToAccess).toBe('business/QuoteBuilder');
    }
  });
});

describe('BE-104 admin-only permission seeds', () => {
  it('upserts three endpoints into both maps, admin only, plus request-id index', async () => {
    const {
      seedOrderOperations: seed,
    } = require('../scripts/seed-order-operations.cjs');
    const rows = new Map();
    const index = jest.fn();
    const db = {
      collection: (name) => ({
        createIndex: index,
        updateOne: async (filter, update) => {
          rows.set(name + JSON.stringify(filter), update.$set);
        },
      }),
    };
    await seed(db);
    await seed(db);
    expect(rows.size).toBe(6);
    for (const row of rows.values()) expect(row.RoleName).toBe('admin');
    expect(index).toHaveBeenCalledWith(
      { RequestId: 1 },
      expect.objectContaining({ unique: true }),
    );
  });
});
