const roles = [
  'annonymous',
  'customer',
  'appuser',
  'admin',
  'wholesaler',
  'employee',
];
const endpoints = [
  {
    FeatureId: 'ListProductReviews',
    route: 'business/ListProductReviews',
    allowedRoles: roles,
  },
  {
    FeatureId: 'CreateProductReview',
    route: 'business/CreateProductReview',
    allowedRoles: ['customer'],
  },
  {
    FeatureId: 'ClientSignUp',
    route: 'auth/client-signup',
    allowedRoles: roles,
  },
];

async function seedProductReviews(db) {
  for (const { FeatureId, route, allowedRoles } of endpoints) {
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
          $setOnInsert: {
            _id: `product-review-endpoint-${FeatureId}-${RoleName}`,
          },
        },
        { upsert: true },
      );
      await db.collection('featurerolemaps').updateOne(
        { FeatureId, RoleName },
        {
          $set: common,
          $setOnInsert: { _id: `product-review-role-${FeatureId}-${RoleName}` },
        },
        { upsert: true },
      );
    }
  }

  await db
    .collection('productreviews')
    .createIndex({ ProductId: 1, IsDeleted: 1, CreatedDate: -1 });
  await db
    .collection('productreviews')
    .createIndex({ ProductId: 1, UserId: 1 }, { unique: true });
}

module.exports = { seedProductReviews, endpoints, roles };

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
      await seedProductReviews(client.db());
      console.log('Product review indexes and permission mappings applied.');
    } catch {
      console.error(
        'Product review seed failed; check database connectivity and write permissions.',
      );
      process.exitCode = 1;
    } finally {
      await client.close();
    }
  })();
}
