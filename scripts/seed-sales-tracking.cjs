const endpoints = ['ListSalesUsers', 'GetSalesHistory'];

async function seedSalesTracking(db) {
  for (const FeatureId of endpoints) {
    const common = {
      FeatureId,
      FeatureName: 'Sales tracking',
      RoleName: 'admin',
    };
    await db.collection('featureendpointmaps').updateOne(
      { APIToAccess: `business/${FeatureId}`, RoleName: 'admin' },
      {
        $set: { ...common, APIToAccess: `business/${FeatureId}` },
        $setOnInsert: { _id: `sales-tracking-endpoint-${FeatureId}` },
      },
      { upsert: true },
    );
    await db.collection('featurerolemaps').updateOne(
      { FeatureId, RoleName: 'admin' },
      {
        $set: common,
        $setOnInsert: { _id: `sales-tracking-role-${FeatureId}` },
      },
      { upsert: true },
    );
  }

  await db
    .collection('invoices')
    .createIndex({ SoldByUserId: 1, CreatedDate: -1, _id: -1 });
  await db
    .collection('invoices')
    .createIndex({ InvoiceType: 1, CreatedDate: -1, _id: -1 });
}

module.exports = { endpoints, seedSalesTracking };

if (require.main === module) {
  const { MongoClient } = require('mongoose').mongo;
  require('dotenv').config({ quiet: true });
  const env = process.env;
  const hosts = env.DB_HOSTS || env.DB_HOST;
  if (!env.DB_URI && !hosts) throw new Error('Missing Mongo configuration');
  const uri =
    env.DB_URI ||
    `${env.DB_PROTOCOL || 'mongodb+srv'}://${
      env.DB_USER
        ? `${encodeURIComponent(env.DB_USER)}:${encodeURIComponent(env.DB_PASSWORD || '')}@`
        : ''
    }${hosts}/${env.DB_NAME || ''}${
      env.DB_QUERY ? `?${env.DB_QUERY.replace(/^\?/, '')}` : ''
    }`;
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  (async () => {
    try {
      await client.connect();
      await seedSalesTracking(client.db());
      console.log('Sales tracking permissions and indexes applied.');
    } catch (error) {
      console.error('Sales tracking seed failed.', error?.message || error);
      process.exitCode = 1;
    } finally {
      await client.close();
    }
  })();
}
