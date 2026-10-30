const endpoints = [
  { FeatureId: 'ConfigureProductQr', roles: ['admin'] },
  {
    FeatureId: 'VerifyProductQr',
    roles: ['annonymous', 'customer', 'appuser', 'admin', 'wholesaler', 'employee'],
  },
];

async function seedProductQr(db) {
  for (const { FeatureId, roles } of endpoints) {
    for (const RoleName of roles) {
      const common = { FeatureId, FeatureName: FeatureId, RoleName };
      await db.collection('featureendpointmaps').updateOne(
        { APIToAccess: `business/${FeatureId}`, RoleName },
        {
          $set: { ...common, APIToAccess: `business/${FeatureId}` },
          $setOnInsert: { _id: `be-109-endpoint-${FeatureId}-${RoleName}` },
        },
        { upsert: true },
      );
      await db.collection('featurerolemaps').updateOne(
        { FeatureId, RoleName },
        {
          $set: common,
          $setOnInsert: { _id: `be-109-role-${FeatureId}-${RoleName}` },
        },
        { upsert: true },
      );
    }
  }

  await db.collection('products').createIndex(
    { QrVerificationToken: 1 },
    {
      unique: true,
      partialFilterExpression: { QrVerificationToken: { $type: 'string' } },
    },
  );
}

module.exports = { seedProductQr, endpoints };

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
      await seedProductQr(client.db());
      console.log('BE-109 QR index and permission mappings applied.');
    } catch {
      console.error(
        'BE-109 seed failed; check database connectivity and write permissions.',
      );
      process.exitCode = 1;
    } finally {
      await client.close();
    }
  })();
}
