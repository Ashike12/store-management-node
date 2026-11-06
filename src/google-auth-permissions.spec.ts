/* eslint-disable @typescript-eslint/no-var-requires */
const {
  endpoint,
  roles,
  seedGoogleAuth,
} = require('../scripts/seed-google-auth.cjs');

describe('Google client authentication permission seed', () => {
  it('seeds the endpoint and role maps repeatably', async () => {
    const collection = () => ({
      deleteMany: jest.fn().mockResolvedValue(undefined),
      updateOne: jest.fn().mockResolvedValue(undefined),
    });
    const endpointMaps = collection();
    const roleMaps = collection();
    const db = {
      collection: jest.fn((name: string) =>
        name === 'featureendpointmaps' ? endpointMaps : roleMaps,
      ),
    };

    await seedGoogleAuth(db);
    await seedGoogleAuth(db);

    expect(endpoint.route).toBe('auth/client-google');
    expect(endpointMaps.updateOne).toHaveBeenCalledTimes(roles.length * 2);
    expect(roleMaps.updateOne).toHaveBeenCalledTimes(roles.length * 2);
    expect(endpointMaps.updateOne).toHaveBeenCalledWith(
      { APIToAccess: endpoint.route, RoleName: 'customer' },
      expect.objectContaining({
        $set: expect.objectContaining({ FeatureId: 'ClientGoogleAuth' }),
      }),
      { upsert: true },
    );
  });
});
