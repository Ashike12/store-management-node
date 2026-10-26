const endpoints = ['ListProductBatches', 'ListBatchItems'];

async function seedInventoryBatches(db) {
  for (const FeatureId of endpoints) {
    const common = { FeatureId, FeatureName: FeatureId, RoleName: 'admin' };
    await db.collection('featureendpointmaps').updateOne(
      { APIToAccess: `business/${FeatureId}`, RoleName: 'admin' },
      {
        $set: { ...common, APIToAccess: `business/${FeatureId}` },
        $setOnInsert: { _id: `be-110-endpoint-${FeatureId}` },
      },
      { upsert: true },
    );
    await db.collection('featurerolemaps').updateOne(
      { FeatureId, RoleName: 'admin' },
      {
        $set: common,
        $setOnInsert: { _id: `be-110-role-${FeatureId}` },
      },
      { upsert: true },
    );
  }
  await db.collection('products').createIndex(
    { CreationRequestId: 1 },
    {
      unique: true,
      partialFilterExpression: { CreationRequestId: { $type: 'string' } },
    },
  );
  await db
    .collection('inventorybatches')
    .createIndex({ BatchId: 1 }, { unique: true });
  await db
    .collection('inventorybatches')
    .createIndex({ RequestId: 1, ProductId: 1 }, { unique: true });
  await db
    .collection('inventoryitems')
    .createIndex({ SerialNumber: 1 }, { unique: true });
  await db
    .collection('inventoryitems')
    .createIndex({ BatchId: 1, UnitIndex: 1 }, { unique: true });
}

module.exports = { seedInventoryBatches, endpoints };

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
      await seedInventoryBatches(client.db());
      console.log('BE-110 inventory indexes and permissions applied.');
    } catch {
      console.error(
        'BE-110 seed failed; check database connectivity and write permissions.',
      );
      process.exitCode = 1;
    } finally {
      await client.close();
    }
  })();
}
