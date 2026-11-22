const endpoint = {
  FeatureId: 'GetClientProducts',
  route: 'business/GetClientProducts',
};
const roles = ['annonymous', 'customer', 'appuser', 'admin', 'manager', 'wholesaler', 'employee'];

async function seedClientProductsAccess(db) {
  for (const RoleName of roles) {
    const common = { FeatureId: endpoint.FeatureId, FeatureName: endpoint.FeatureId, RoleName };
    await db.collection('featureendpointmaps').updateOne(
      { APIToAccess: endpoint.route, RoleName },
      {
        $set: { ...common, APIToAccess: endpoint.route },
        $setOnInsert: { _id: `client-products-endpoint-${RoleName}` },
      },
      { upsert: true },
    );
    await db.collection('featurerolemaps').updateOne(
      { FeatureId: endpoint.FeatureId, RoleName },
      { $set: common, $setOnInsert: { _id: `client-products-role-${RoleName}` } },
      { upsert: true },
    );
  }
}

module.exports = { endpoint, roles, seedClientProductsAccess };

if (require.main === module) {
  const { MongoClient } = require('mongoose').mongo;
  require('dotenv').config({ quiet: true });
  const e = process.env;
  const hosts = e.DB_HOSTS || e.DB_HOST;
  if (!e.DB_URI && !hosts) throw new Error('Missing Mongo configuration');
  const uri = e.DB_URI || `${e.DB_PROTOCOL || 'mongodb+srv'}://${e.DB_USER ? `${encodeURIComponent(e.DB_USER)}:${encodeURIComponent(e.DB_PASSWORD || '')}@` : ''}${hosts}/${e.DB_NAME || ''}${e.DB_QUERY ? `?${e.DB_QUERY.replace(/^\?/, '')}` : ''}`;
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  (async () => {
    try {
      await client.connect();
      await seedClientProductsAccess(client.db());
      console.log('Client product access mappings applied to both collections.');
    } catch {
      console.error('Client product access seed failed; check database connectivity and write permissions.');
      process.exitCode = 1;
    } finally {
      await client.close();
    }
  })();
}
