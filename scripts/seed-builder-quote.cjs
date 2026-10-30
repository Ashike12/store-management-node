const feature = 'QuoteBuilder';
const endpoint = 'business/QuoteBuilder';
// Public storefront access, including the application's existing anonymous role.
const roles = ['annonymous', 'customer', 'appuser', 'admin', 'wholesaler', 'employee'];

async function seedBuilderQuote(db) {
  for (const RoleName of roles) {
    const common = { FeatureId: feature, FeatureName: feature, RoleName };
    await db
      .collection('featureendpointmaps')
      .updateOne(
        { APIToAccess: endpoint, RoleName },
        {
          $set: { ...common, APIToAccess: endpoint },
          $setOnInsert: { _id: `be-102-endpoint-${RoleName}` },
        },
        { upsert: true },
      );
    await db
      .collection('featurerolemaps')
      .updateOne(
        { FeatureId: feature, RoleName },
        { $set: common, $setOnInsert: { _id: `be-102-role-${RoleName}` } },
        { upsert: true },
      );
  }
}

module.exports = { seedBuilderQuote, roles };

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
      await seedBuilderQuote(client.db());
      console.log('BE-102 permission mappings applied to both collections.');
    } catch {
      console.error(
        'BE-102 seed failed; check database connectivity and write permissions.',
      );
      process.exitCode = 1;
    } finally {
      await client.close();
    }
  })();
}
