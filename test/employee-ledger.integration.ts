import mongoose, { Connection, Model } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { EmployeeService } from '../src/employee/employee.service';
import { EmployeeFeedback, EmployeeFeedbackSchema } from '../src/employee/schemas/employee-feedback.schema';
import { EmployeeLedgerAudit, EmployeeLedgerAuditSchema } from '../src/employee/schemas/employee-ledger-audit.schema';
import { EmployeePaymentEntry, EmployeePaymentEntrySchema } from '../src/employee/schemas/employee-payment-entry.schema';
import { EmployeeWorkEntry, EmployeeWorkEntrySchema } from '../src/employee/schemas/employee-work-entry.schema';
import { InventoryBatch, InventoryBatchSchema } from '../src/shared/schemas/inventory-batch.schema';
import { User, UserSchema } from '../src/shared/schemas/user.schema';
import { Product, ProductSchema } from '../src/shared/schemas/product.schema';

jest.setTimeout(180000);

describe('BE-111 employee ledger on an isolated replica set', () => {
  let server: MongoMemoryReplSet;
  let connection: Connection;
  let users: Model<User>;
  let work: Model<EmployeeWorkEntry>;
  let payments: Model<EmployeePaymentEntry>;
  let feedback: Model<EmployeeFeedback>;
  let audits: Model<EmployeeLedgerAudit>;
  let batches: Model<InventoryBatch>;
  let products: Model<Product>;
  let service: EmployeeService;
  const admin = { _id: 'admin-1', Roles: ['admin'] } as User;
  const employee = { _id: 'employee-1', Roles: ['employee', 'appuser'] } as User;

  beforeAll(async () => {
    server = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    connection = await mongoose.createConnection(server.getUri(), { dbName: 'employee_ledger_test' }).asPromise();
    users = connection.model(User.name, UserSchema);
    work = connection.model(EmployeeWorkEntry.name, EmployeeWorkEntrySchema);
    payments = connection.model(EmployeePaymentEntry.name, EmployeePaymentEntrySchema);
    feedback = connection.model(EmployeeFeedback.name, EmployeeFeedbackSchema);
    audits = connection.model(EmployeeLedgerAudit.name, EmployeeLedgerAuditSchema);
    batches = connection.model(InventoryBatch.name, InventoryBatchSchema);
    products = connection.model(Product.name, ProductSchema);
    await Promise.all([users.init(), work.init(), payments.init(), feedback.init(), audits.init(), batches.init(), products.init()]);
    service = new EmployeeService(users, work, payments, feedback, audits, batches, products);
  });

  afterAll(async () => {
    await connection?.close();
    await server?.stop();
  });

  beforeEach(async () => {
    await Promise.all([users.deleteMany({}), work.deleteMany({}), payments.deleteMany({}), feedback.deleteMany({}), audits.deleteMany({}), batches.deleteMany({}), products.deleteMany({})]);
    await users.create([
      { _id: 'employee-1', DisplayName: 'First Employee', Email: 'one@example.com', Active: true, Roles: ['employee', 'appuser'] },
      { _id: 'employee-2', DisplayName: 'Second Employee', Email: 'two@example.com', Active: true, Roles: ['employee', 'appuser'] },
    ]);
  });

  it('searches only batches attributed to the selected employee', async () => {
    await products.create([
      { _id: 'product-1', ProductName: 'Bonafide Net', Category: 'MosquitoNet', SubCategory: 'Double' },
      { _id: 'product-2', ProductName: 'Fishing Net', Category: 'FishingNet', SubCategory: 'Jhaki-Zal' },
    ]);
    await batches.create([
      { _id: 'batch-1', BatchId: 'BAT-EMPLOYEE-ONE', ProductId: 'product-1', QuantityReceived: 10, CreatedBy: 'admin-1', RequestId: 'request-1', MadeByEmployeeId: 'employee-1' },
      { _id: 'batch-2', BatchId: 'BAT-OTHER-EMPLOYEE', ProductId: 'product-1', QuantityReceived: 8, CreatedBy: 'admin-1', RequestId: 'request-2', MadeByEmployeeId: 'employee-2' },
      { _id: 'batch-3', BatchId: 'BAT-FISHING', ProductId: 'product-2', QuantityReceived: 6, CreatedBy: 'admin-1', RequestId: 'request-3', MadeByEmployeeId: 'employee-1' },
    ]);

    const result: any = await service.listEmployeeBatches(
      { EmployeeId: 'employee-1', SearchTerm: 'Bonafide', Page: 1, Size: 20 },
      admin,
    );

    expect(result.TotalCount).toBe(1);
    expect(result.Data).toEqual([
      expect.objectContaining({ BatchId: 'BAT-EMPLOYEE-ONE', ProductName: 'Bonafide Net' }),
    ]);
  });

  it('stores precise money, aggregates daily work, and reports who owes whom', async () => {
    await service.createWorkEntry({ EmployeeId: 'employee-1', WorkDate: '2026-10-27', Description: 'Morning production', Amount: 500.25 }, admin);
    await service.createWorkEntry({ EmployeeId: 'employee-1', WorkDate: '2026-10-27', Description: 'Evening production', Amount: 125.1 }, admin);
    await service.createPaymentEntry({ EmployeeId: 'employee-1', PaymentDate: '2026-10-27', Amount: 200 }, admin);

    const result: any = await service.getOverview({ EmployeeId: 'employee-1' }, admin);
    expect(result.Data.Summary).toEqual({
      TotalEarned: 625.35,
      TotalPaid: 200,
      Balance: 425.35,
      BalanceDirection: 'business_owes_employee',
    });
    expect(result.Data.DailyWork).toContainEqual({ WorkDate: '2026-10-27', Amount: 625.35 });
    expect(await audits.countDocuments()).toBe(3);
  });

  it('prevents employees from reading another employee ledger', async () => {
    await expect(
      service.getOverview({ EmployeeId: 'employee-2' }, employee),
    ).rejects.toThrow('Employees can only access their own ledger');
  });

  it('allows feedback only on the employee own entry and resolves it once', async () => {
    const created: any = await service.createWorkEntry(
      { EmployeeId: 'employee-1', WorkDate: '2026-10-27', Description: 'Net work', Amount: 300 },
      admin,
    );
    const response: any = await service.submitFeedback(
      { TargetType: 'work', TargetId: created.Data.ItemId, Explanation: 'Please verify this amount' },
      employee,
    );
    await service.resolveFeedback(
      { FeedbackId: response.Data.ItemId, Status: 'accepted', ResolutionNote: 'Reviewed; ledger changes require a separate edit.' },
      admin,
    );
    await expect(
      service.resolveFeedback(
        { FeedbackId: response.Data.ItemId, Status: 'declined', ResolutionNote: 'Second decision' },
        admin,
      ),
    ).rejects.toThrow('already resolved');
    await expect(
      service.submitFeedback(
        { TargetType: 'work', TargetId: created.Data.ItemId, Explanation: 'Not mine' },
        { _id: 'employee-2', Roles: ['employee'] } as User,
      ),
    ).rejects.toThrow('does not belong to you');
  });
});
