const roles = [
  'annonymous',
  'customer',
  'appuser',
  'admin',
  'wholesaler',
  'employee',
];

const endpoint = {
  FeatureId: 'ClientGoogleAuth',
  route: 'auth/client-google',
  allowedRoles: roles,
};

async function seedGoogleAuth(db) {
  const { FeatureId, route, allowedRoles } = endpoint;
  await db.collection('featureendpointmaps').deleteMany({
    APIToAccess: route,
    RoleName: { $nin: allowedRoles },
  });
  await db.collection('featurerolemaps').deleteMany({
    FeatureId,
    RoleName: { $nin: allowedRoles },
  });

  for (const RoleName of allowedRoles) {
    const common = { FeatureId, FeatureName: FeatureId, RoleName };
    await db.collection('featureendpointmaps').updateOne(
      { APIToAccess: route, RoleName },
      {
        $set: { ...common, APIToAccess: route },
        $setOnInsert: { _id: `google-auth-endpoint-${RoleName}` },
      },
      { upsert: true },
    );
    await db.collection('featurerolemaps').updateOne(
      { FeatureId, RoleName },
      {
        $set: common,
        $setOnInsert: { _id: `google-auth-role-${RoleName}` },
      },
      { upsert: true },
    );
  }
}

module.exports = { endpoint, roles, seedGoogleAuth };

if (require.main === module) {
  const { MongoClient } = require('mongoose').mongo;
  require('dotenv').config({ quiet: true });
  const e = process.env;
  const hosts = e.DB_HOSTS || e.DB_HOST;
  if (!e.DB_URI && !hosts) throw new Error('Missing Mongo configuration');
  const uri =
    e.DB_URI ||
    `${e.DB_PROTOCOL || 'mongodb+srv'}://${
      e.DB_USER
        ? `${encodeURIComponent(e.DB_USER)}:${encodeURIComponent(e.DB_PASSWORD || '')}@`
        : ''
    }${hosts}/${e.DB_NAME || ''}${e.DB_QUERY ? `?${e.DB_QUERY.replace(/^\?/, '')}` : ''}`;
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  (async () => {
    try {
      await client.connect();
      await seedGoogleAuth(client.db());
      console.log('Google authentication permission mappings applied.');
    } catch {
      console.error(
        'Google authentication seed failed; check database connectivity and write permissions.',
      );
      process.exitCode = 1;
    } finally {
      await client.close();
    }
  })();
}
