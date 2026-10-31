const roles = ['admin'];

async function seedOrderOperations(db) {
  for (const FeatureId of [
    'ListOrders',
    'GetOrder',
    'TransitionOrder',
    'UpdateOrderInfo',
  ]) {
    const common = { FeatureId, FeatureName: FeatureId, RoleName: 'admin' };
    await db.collection('featureendpointmaps').updateOne(
      { APIToAccess: 'business/' + FeatureId, RoleName: 'admin' },
      {
        $set: { ...common, APIToAccess: 'business/' + FeatureId },
        $setOnInsert: { _id: 'be-104-endpoint-' + FeatureId },
      },
      { upsert: true },
    );
    await db
      .collection('featurerolemaps')
      .updateOne(
        { FeatureId, RoleName: 'admin' },
        { $set: common, $setOnInsert: { _id: 'be-104-role-' + FeatureId } },
        { upsert: true },
      );
  }
  await db.collection('orders').createIndex(
    { RequestId: 1 },
    {
      unique: true,
      partialFilterExpression: { RequestId: { $type: 'string' } },
    },
  );
  await db.collection('orders').createIndex({ CreatedDate: -1, _id: -1 });
  await db
    .collection('orders')
    .createIndex({ OrderStatus: 1, CreatedDate: -1 });
}

module.exports = { seedOrderOperations, roles };

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
        ? encodeURIComponent(e.DB_USER) +
          ':' +
          encodeURIComponent(e.DB_PASSWORD || '') +
          '@'
        : ''
    }${hosts}/${e.DB_NAME || ''}${e.DB_QUERY ? '?' + e.DB_QUERY.replace(/^\?/, '') : ''}`;
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  (async () => {
    try {
      await client.connect();
      await seedOrderOperations(client.db());
      console.log('BE-104 permission mappings applied to both collections.');
    } catch {
      console.error(
        'BE-104 seed failed; check database connectivity and write permissions.',
      );
      process.exitCode = 1;
    } finally {
      await client.close();
    }
  })();
}
