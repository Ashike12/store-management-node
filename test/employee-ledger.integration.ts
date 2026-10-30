import mongoose, { Connection, Model } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { EmployeeService } from '../src/employee/employee.service';
import { EmployeeFeedback, EmployeeFeedbackSchema } from '../src/employee/schemas/employee-feedback.schema';
import { EmployeeLedgerAudit, EmployeeLedgerAuditSchema } from '../src/employee/schemas/employee-ledger-audit.schema';
import { EmployeePaymentEntry, EmployeePaymentEntrySchema } from '../src/employee/schemas/employee-payment-entry.schema';
import { EmployeeWorkEntry, EmployeeWorkEntrySchema } from '../src/employee/schemas/employee-work-entry.schema';
import { InventoryBatch, InventoryBatchSchema } from '../src/shared/schemas/inventory-batch.schema';
import { User, UserSchema } from '../src/shared/schemas/user.schema';

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
    await Promise.all([users.init(), work.init(), payments.init(), feedback.init(), audits.init(), batches.init()]);
    service = new EmployeeService(users, work, payments, feedback, audits, batches);
  });

  afterAll(async () => {
    await connection?.close();
    await server?.stop();
  });

  beforeEach(async () => {
    await Promise.all([users.deleteMany({}), work.deleteMany({}), payments.deleteMany({}), feedback.deleteMany({}), audits.deleteMany({}), batches.deleteMany({})]);
    await users.create([
      { _id: 'employee-1', DisplayName: 'First Employee', Email: 'one@example.com', Active: true, Roles: ['employee', 'appuser'] },
      { _id: 'employee-2', DisplayName: 'Second Employee', Email: 'two@example.com', Active: true, Roles: ['employee', 'appuser'] },
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
