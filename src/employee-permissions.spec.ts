import { UserRoles } from './shared/constant/roles.constant';

const { endpointRoles, seedEmployees } = require('../scripts/seed-employees.cjs');

describe('BE-111 employee permission seed', () => {
  it('defines the employee role and maps every endpoint deliberately', () => {
    expect(UserRoles.Employee).toBe('employee');
    expect(endpointRoles.GetOverview).toEqual(['admin', 'employee']);
    expect(endpointRoles.SubmitFeedback).toEqual(['employee']);
    expect(endpointRoles.CreateWorkEntry).toEqual(['admin']);
    expect(endpointRoles.ListEmployeeBatches).toEqual(['admin']);
    expect(endpointRoles.CreatePaymentEntry).toEqual(['admin']);
    expect(endpointRoles.ResolveFeedback).toEqual(['admin']);
  });

  it('repeatably seeds every mapping into both permission collections', async () => {
    const rows = new Map<string, unknown>();
    const db = {
      collection: (name: string) => ({
        updateOne: async (filter, update) => {
          rows.set(`${name}:${JSON.stringify(filter)}`, update.$set);
        },
        createIndex: jest.fn(),
      }),
    };
    await seedEmployees(db);
    const mappings = Object.values(endpointRoles as Record<string, string[]>).reduce(
      (total: number, roles: string[]) => total + roles.length,
      0,
    );
    expect(rows.size).toBe(mappings * 2);
    expect([...rows.keys()].filter(key => key.startsWith('featureendpointmaps:'))).toHaveLength(mappings);
    expect([...rows.keys()].filter(key => key.startsWith('featurerolemaps:'))).toHaveLength(mappings);
  });
});
