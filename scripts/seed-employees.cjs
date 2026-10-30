const endpointRoles = {
  CreateEmployee: ['admin'],
  ListEmployees: ['admin'],
  UpdateEmployee: ['admin'],
  DeactivateEmployee: ['admin'],
  GetOverview: ['admin', 'employee'],
  CreateWorkEntry: ['admin'],
  UpdateWorkEntry: ['admin'],
  DeleteWorkEntry: ['admin'],
  CreatePaymentEntry: ['admin'],
  UpdatePaymentEntry: ['admin'],
  DeletePaymentEntry: ['admin'],
  SubmitFeedback: ['employee'],
  ResolveFeedback: ['admin'],
  ListNotifications: ['admin'],
  MarkNotificationRead: ['admin'],
};

async function seedEmployees(db) {
  for (const [FeatureId, roles] of Object.entries(endpointRoles)) {
    for (const RoleName of roles) {
      const common = { FeatureId, FeatureName: FeatureId, RoleName };
      await db.collection('featureendpointmaps').updateOne(
        { APIToAccess: `employee/${FeatureId}`, RoleName },
        { $set: { ...common, APIToAccess: `employee/${FeatureId}` }, $setOnInsert: { _id: `be-111-endpoint-${FeatureId}-${RoleName}` } },
        { upsert: true },
      );
      await db.collection('featurerolemaps').updateOne(
        { FeatureId, RoleName },
        { $set: common, $setOnInsert: { _id: `be-111-role-${FeatureId}-${RoleName}` } },
        { upsert: true },
      );
    }
  }
  await db.collection('employeeworkentries').createIndex({ EmployeeId: 1, WorkDate: -1, IsDeleted: 1 });
  await db.collection('employeepaymententries').createIndex({ EmployeeId: 1, PaymentDate: -1, IsDeleted: 1 });
  await db.collection('employeefeedback').createIndex(
    { EmployeeId: 1, TargetType: 1, TargetId: 1 },
    { unique: true },
  );
  await db.collection('inventorybatches').createIndex({ MadeByEmployeeId: 1, CreatedDate: -1 });
}

module.exports = { seedEmployees, endpointRoles };

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
      await seedEmployees(client.db());
      console.log('BE-111 employee indexes and permission mappings applied.');
    } catch {
      console.error('BE-111 seed failed; check database connectivity and write permissions.');
      process.exitCode = 1;
    } finally { await client.close(); }
  })();
}
