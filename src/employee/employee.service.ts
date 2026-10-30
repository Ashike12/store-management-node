import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { ClientSession, Model } from 'mongoose';
import { UserRoles } from '../shared/constant/roles.constant';
import { InventoryBatch } from '../shared/schemas/inventory-batch.schema';
import { User } from '../shared/schemas/user.schema';
import { Product } from '../shared/schemas/product.schema';
import {
  CreateEmployeeDto,
  CreatePaymentEntryDto,
  CreateWorkEntryDto,
  EmployeeOverviewDto,
  ListEmployeesDto,
  ListEmployeeBatchesDto,
  ListNotificationsDto,
  ResolveFeedbackDto,
  SubmitFeedbackDto,
  UpdateEmployeeDto,
  UpdatePaymentEntryDto,
  UpdateWorkEntryDto,
} from './dto/employee.dto';
import { EmployeeFeedback } from './schemas/employee-feedback.schema';
import { EmployeeLedgerAudit } from './schemas/employee-ledger-audit.schema';
import { EmployeePaymentEntry } from './schemas/employee-payment-entry.schema';
import { EmployeeWorkEntry } from './schemas/employee-work-entry.schema';

@Injectable()
export class EmployeeService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(EmployeeWorkEntry.name)
    private readonly workEntries: Model<EmployeeWorkEntry>,
    @InjectModel(EmployeePaymentEntry.name)
    private readonly payments: Model<EmployeePaymentEntry>,
    @InjectModel(EmployeeFeedback.name)
    private readonly feedback: Model<EmployeeFeedback>,
    @InjectModel(EmployeeLedgerAudit.name)
    private readonly audits: Model<EmployeeLedgerAudit>,
    @InjectModel(InventoryBatch.name)
    private readonly batches: Model<InventoryBatch>,
    @InjectModel(Product.name)
    private readonly products: Model<Product>,
  ) {}

  private ensureAdmin(user: User) {
    if (!user?.Roles?.includes(UserRoles.Admin)) {
      throw new ForbiddenException('Admin access required');
    }
  }

  private ensureEmployee(user: User) {
    if (!user?.Roles?.includes(UserRoles.Employee)) {
      throw new ForbiddenException('Employee access required');
    }
  }

  private id() {
    return randomUUID().replace(/-/g, '');
  }

  private now() {
    return new Date().toISOString();
  }

  private toPaisa(amount: number) {
    return Math.round(amount * 100);
  }

  private toAmount(paisa = 0) {
    return Number((paisa / 100).toFixed(2));
  }

  private validateDate(value: string, field: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException(`${field} must use YYYY-MM-DD`);
    }
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      throw new BadRequestException(`${field} is not a valid date`);
    }
  }

  private async requireEmployee(EmployeeId: string, activeOnly = false) {
    const employee = await this.users.findOne({
      _id: EmployeeId,
      Roles: UserRoles.Employee,
      ...(activeOnly ? { Active: true } : {}),
    });
    if (!employee) throw new NotFoundException('Employee not found');
    return employee;
  }

  async createEmployee(dto: CreateEmployeeDto, admin: User) {
    this.ensureAdmin(admin);
    const Email = dto.Email.trim().toLowerCase();
    if (await this.users.exists({ Email })) {
      throw new ConflictException('An account already uses this email');
    }
    const _id = this.id();
    const DisplayName = dto.DisplayName?.trim() ||
      [dto.FirstName, dto.LastName].filter(Boolean).join(' ');
    await this.users.create({
      _id,
      FirstName: dto.FirstName.trim(),
      LastName: dto.LastName.trim(),
      DisplayName,
      Email,
      Phone: dto.Phone.trim(),
      Address: dto.Address.trim(),
      Password: await bcrypt.hash(dto.Password, 10),
      Active: true,
      Roles: [UserRoles.AppUser, UserRoles.Employee],
      CreatedDate: this.now(),
      RolesAllowedToRead: [UserRoles.Admin],
      RolesAllowedToWrite: [UserRoles.Admin],
      RolesAllowedToUpdate: [UserRoles.Admin],
    });
    return { IsSuccess: true, Data: { ItemId: _id } };
  }

  async listEmployeeBatches(dto: ListEmployeeBatchesDto, admin: User) {
    this.ensureAdmin(admin);
    await this.requireEmployee(dto.EmployeeId);

    const filter: Record<string, unknown> = { MadeByEmployeeId: dto.EmployeeId };
    const term = dto.SearchTerm?.trim();
    if (term) {
      const safe = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const expression = new RegExp(safe, 'i');
      const matchingProducts = await this.products
        .find({ ProductName: expression })
        .select('_id')
        .limit(50)
        .lean();
      filter.$or = [
        { BatchId: expression },
        { ProductId: { $in: matchingProducts.map((item: any) => String(item._id)) } },
      ];
    }

    const [batches, TotalCount] = await Promise.all([
      this.batches
        .find(filter)
        .select('BatchId ProductId QuantityReceived CreatedDate')
        .sort({ CreatedDate: -1, BatchId: -1 })
        .skip((dto.Page - 1) * dto.Size)
        .limit(dto.Size)
        .lean(),
      this.batches.countDocuments(filter),
    ]);
    const productIds = [...new Set(batches.map((batch: any) => String(batch.ProductId)))];
    const products = await this.products
      .find({ _id: { $in: productIds } })
      .select('_id ProductName Category SubCategory')
      .lean();
    const productMap = new Map(products.map((product: any) => [String(product._id), product]));

    return {
      IsSuccess: true,
      Data: batches.map((batch: any) => {
        const product = productMap.get(String(batch.ProductId)) as any;
        return {
          BatchId: batch.BatchId,
          ProductId: batch.ProductId,
          ProductName: product?.ProductName || 'Unknown product',
          Category: product?.Category || '',
          SubCategory: product?.SubCategory || '',
          QuantityReceived: batch.QuantityReceived,
          CreatedDate: batch.CreatedDate,
        };
      }),
      TotalCount,
    };
  }

  async listEmployees(dto: ListEmployeesDto, admin: User) {
    this.ensureAdmin(admin);
    const filter: Record<string, unknown> = { Roles: UserRoles.Employee };
    if (dto.Status === 'active') filter.Active = true;
    if (dto.Status === 'inactive') filter.Active = false;
    if (dto.SearchTerm?.trim()) {
      const safe = dto.SearchTerm.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { DisplayName: new RegExp(safe, 'i') },
        { Email: new RegExp(safe, 'i') },
        { Phone: new RegExp(safe, 'i') },
      ];
    }
    const employees = await this.users.find(filter)
      .select('_id FirstName LastName DisplayName Email Phone Address Active')
      .sort({ DisplayName: 1 })
      .skip((dto.Page - 1) * dto.Size)
      .limit(dto.Size)
      .lean();
    const ids = employees.map((employee: any) => String(employee._id));
    const [earned, paid] = await Promise.all([
      this.workEntries.aggregate([
        { $match: { EmployeeId: { $in: ids }, IsDeleted: false } },
        { $group: { _id: '$EmployeeId', value: { $sum: '$AmountPaisa' } } },
      ]),
      this.payments.aggregate([
        { $match: { EmployeeId: { $in: ids }, IsDeleted: false } },
        { $group: { _id: '$EmployeeId', value: { $sum: '$AmountPaisa' } } },
      ]),
    ]);
    const earnedMap = new Map(earned.map((item: any) => [item._id, item.value]));
    const paidMap = new Map(paid.map((item: any) => [item._id, item.value]));
    return {
      IsSuccess: true,
      Data: employees.map((employee: any) => {
        const TotalEarnedPaisa = earnedMap.get(String(employee._id)) || 0;
        const TotalPaidPaisa = paidMap.get(String(employee._id)) || 0;
        return {
          ItemId: employee._id,
          FirstName: employee.FirstName,
          LastName: employee.LastName,
          DisplayName: employee.DisplayName,
          Email: employee.Email,
          Phone: employee.Phone,
          Address: employee.Address,
          Active: employee.Active,
          TotalEarned: this.toAmount(TotalEarnedPaisa),
          TotalPaid: this.toAmount(TotalPaidPaisa),
          Balance: this.toAmount(TotalEarnedPaisa - TotalPaidPaisa),
        };
      }),
      TotalCount: await this.users.countDocuments(filter),
    };
  }

  async updateEmployee(dto: UpdateEmployeeDto, admin: User) {
    this.ensureAdmin(admin);
    await this.requireEmployee(dto.ItemId);
    const updates = { ...dto } as Record<string, unknown>;
    delete updates.ItemId;
    if (updates.FirstName || updates.LastName) {
      const current = await this.users.findById(dto.ItemId).lean();
      updates.DisplayName = dto.DisplayName?.trim() ||
        [dto.FirstName ?? current.FirstName, dto.LastName ?? current.LastName]
          .filter(Boolean).join(' ');
    }
    await this.users.updateOne({ _id: dto.ItemId }, { $set: updates });
    return { IsSuccess: true, Data: { ItemId: dto.ItemId } };
  }

  async deactivateEmployee(EmployeeId: string, admin: User) {
    this.ensureAdmin(admin);
    await this.requireEmployee(EmployeeId);
    await this.users.updateOne({ _id: EmployeeId }, { $set: { Active: false } });
    return { IsSuccess: true, Data: { ItemId: EmployeeId, Active: false } };
  }

  private resolveOverviewEmployee(dto: EmployeeOverviewDto, user: User) {
    const admin = user?.Roles?.includes(UserRoles.Admin);
    if (admin) {
      if (!dto.EmployeeId) throw new BadRequestException('EmployeeId is required');
      return dto.EmployeeId;
    }
    this.ensureEmployee(user);
    if (dto.EmployeeId && dto.EmployeeId !== String(user._id)) {
      throw new ForbiddenException('Employees can only access their own ledger');
    }
    return String(user._id);
  }

  async getOverview(dto: EmployeeOverviewDto, user: User) {
    const EmployeeId = this.resolveOverviewEmployee(dto, user);
    const employee = await this.requireEmployee(EmployeeId);
    const [work, payments, feedback] = await Promise.all([
      this.workEntries.find({ EmployeeId, IsDeleted: false }).sort({ WorkDate: -1, CreatedDate: -1 }).lean(),
      this.payments.find({ EmployeeId, IsDeleted: false }).sort({ PaymentDate: -1, CreatedDate: -1 }).lean(),
      this.feedback.find({ EmployeeId }).sort({ CreatedDate: -1 }).lean(),
    ]);
    const TotalEarnedPaisa = work.reduce((sum: number, item: any) => sum + item.AmountPaisa, 0);
    const TotalPaidPaisa = payments.reduce((sum: number, item: any) => sum + item.AmountPaisa, 0);
    const balance = TotalEarnedPaisa - TotalPaidPaisa;
    const daily = new Map<string, number>();
    work.forEach((item: any) => daily.set(item.WorkDate, (daily.get(item.WorkDate) || 0) + item.AmountPaisa));
    const mapWork = (item: any) => ({ ...item, ItemId: item._id, Amount: this.toAmount(item.AmountPaisa), AmountPaisa: undefined });
    const mapPayment = (item: any) => ({ ...item, ItemId: item._id, Amount: this.toAmount(item.AmountPaisa), AmountPaisa: undefined });
    return {
      IsSuccess: true,
      Data: {
        Employee: {
          ItemId: employee._id,
          DisplayName: employee.DisplayName,
          Email: employee.Email,
          Phone: employee.Phone,
          Address: employee.Address,
          Active: employee.Active,
        },
        Summary: {
          TotalEarned: this.toAmount(TotalEarnedPaisa),
          TotalPaid: this.toAmount(TotalPaidPaisa),
          Balance: this.toAmount(balance),
          BalanceDirection: balance > 0 ? 'business_owes_employee' : balance < 0 ? 'employee_owes_business' : 'settled',
        },
        DailyWork: [...daily.entries()].map(([WorkDate, AmountPaisa]) => ({ WorkDate, Amount: this.toAmount(AmountPaisa) })),
        WorkEntries: work.map(mapWork),
        PaymentEntries: payments.map(mapPayment),
        Feedback: feedback.map((item: any) => ({ ...item, ItemId: item._id })),
      },
    };
  }

  private async audit(
    EntityType: 'work' | 'payment', EntityId: string,
    Action: 'create' | 'update' | 'delete', Before: any, After: any,
    ChangedBy: string, session: ClientSession,
  ) {
    await this.audits.create([{
      _id: this.id(), EntityType, EntityId, Action, Before, After,
      ChangedBy, CreatedDate: this.now(), RolesAllowedToRead: [UserRoles.Admin],
    }], { session });
  }

  async createWorkEntry(dto: CreateWorkEntryDto, admin: User) {
    this.ensureAdmin(admin);
    this.validateDate(dto.WorkDate, 'WorkDate');
    await this.requireEmployee(dto.EmployeeId, true);
    if (dto.BatchId) {
      const batch = await this.batches.findOne({ BatchId: dto.BatchId, MadeByEmployeeId: dto.EmployeeId });
      if (!batch) throw new BadRequestException('Batch is not attributed to this employee');
    }
    const record = {
      _id: this.id(), EmployeeId: dto.EmployeeId, WorkDate: dto.WorkDate,
      Description: dto.Description.trim(), AmountPaisa: this.toPaisa(dto.Amount),
      BatchId: dto.BatchId || undefined, IsDeleted: false,
      CreatedBy: String(admin._id), CreatedDate: this.now(),
      RolesAllowedToRead: [UserRoles.Admin, UserRoles.Employee],
    };
    const session = await this.workEntries.db.startSession();
    try {
      await session.withTransaction(async () => {
        await this.workEntries.create([record], { session });
        await this.audit('work', record._id, 'create', null, record, String(admin._id), session);
      });
    } finally { await session.endSession(); }
    return { IsSuccess: true, Data: { ItemId: record._id } };
  }

  async updateWorkEntry(dto: UpdateWorkEntryDto, admin: User) {
    this.ensureAdmin(admin);
    if (dto.WorkDate) this.validateDate(dto.WorkDate, 'WorkDate');
    const before: any = await this.workEntries.findOne({ _id: dto.ItemId, IsDeleted: false }).lean();
    if (!before) throw new NotFoundException('Work entry not found');
    if (dto.BatchId) {
      const batch = await this.batches.findOne({ BatchId: dto.BatchId, MadeByEmployeeId: before.EmployeeId });
      if (!batch) throw new BadRequestException('Batch is not attributed to this employee');
    }
    const updates: any = { UpdatedBy: String(admin._id), UpdatedDate: this.now() };
    if (dto.WorkDate !== undefined) updates.WorkDate = dto.WorkDate;
    if (dto.Description !== undefined) updates.Description = dto.Description.trim();
    if (dto.Amount !== undefined) updates.AmountPaisa = this.toPaisa(dto.Amount);
    if (dto.BatchId !== undefined) updates.BatchId = dto.BatchId || undefined;
    const after = { ...before, ...updates };
    const session = await this.workEntries.db.startSession();
    try {
      await session.withTransaction(async () => {
        await this.workEntries.updateOne({ _id: dto.ItemId }, { $set: updates }, { session });
        await this.audit('work', dto.ItemId, 'update', before, after, String(admin._id), session);
      });
    } finally { await session.endSession(); }
    return { IsSuccess: true, Data: { ItemId: dto.ItemId } };
  }

  async deleteWorkEntry(ItemId: string, admin: User) {
    return this.deleteLedger('work', ItemId, admin);
  }

  async createPaymentEntry(dto: CreatePaymentEntryDto, admin: User) {
    this.ensureAdmin(admin);
    this.validateDate(dto.PaymentDate, 'PaymentDate');
    await this.requireEmployee(dto.EmployeeId, true);
    const record = {
      _id: this.id(), EmployeeId: dto.EmployeeId, PaymentDate: dto.PaymentDate,
      AmountPaisa: this.toPaisa(dto.Amount), Note: dto.Note?.trim(),
      Reference: dto.Reference?.trim(), IsDeleted: false,
      CreatedBy: String(admin._id), CreatedDate: this.now(),
      RolesAllowedToRead: [UserRoles.Admin, UserRoles.Employee],
    };
    const session = await this.payments.db.startSession();
    try {
      await session.withTransaction(async () => {
        await this.payments.create([record], { session });
        await this.audit('payment', record._id, 'create', null, record, String(admin._id), session);
      });
    } finally { await session.endSession(); }
    return { IsSuccess: true, Data: { ItemId: record._id } };
  }

  async updatePaymentEntry(dto: UpdatePaymentEntryDto, admin: User) {
    this.ensureAdmin(admin);
    if (dto.PaymentDate) this.validateDate(dto.PaymentDate, 'PaymentDate');
    const before: any = await this.payments.findOne({ _id: dto.ItemId, IsDeleted: false }).lean();
    if (!before) throw new NotFoundException('Payment entry not found');
    const updates: any = { UpdatedBy: String(admin._id), UpdatedDate: this.now() };
    if (dto.PaymentDate !== undefined) updates.PaymentDate = dto.PaymentDate;
    if (dto.Amount !== undefined) updates.AmountPaisa = this.toPaisa(dto.Amount);
    if (dto.Note !== undefined) updates.Note = dto.Note.trim();
    if (dto.Reference !== undefined) updates.Reference = dto.Reference.trim();
    const after = { ...before, ...updates };
    const session = await this.payments.db.startSession();
    try {
      await session.withTransaction(async () => {
        await this.payments.updateOne({ _id: dto.ItemId }, { $set: updates }, { session });
        await this.audit('payment', dto.ItemId, 'update', before, after, String(admin._id), session);
      });
    } finally { await session.endSession(); }
    return { IsSuccess: true, Data: { ItemId: dto.ItemId } };
  }

  async deletePaymentEntry(ItemId: string, admin: User) {
    return this.deleteLedger('payment', ItemId, admin);
  }

  private async deleteLedger(type: 'work' | 'payment', ItemId: string, admin: User) {
    this.ensureAdmin(admin);
    const model: Model<any> = type === 'work' ? this.workEntries : this.payments;
    const before: any = await model.findOne({ _id: ItemId, IsDeleted: false }).lean();
    if (!before) throw new NotFoundException(`${type === 'work' ? 'Work' : 'Payment'} entry not found`);
    const updates = { IsDeleted: true, UpdatedBy: String(admin._id), UpdatedDate: this.now() };
    const session = await model.db.startSession();
    try {
      await session.withTransaction(async () => {
        await model.updateOne({ _id: ItemId }, { $set: updates }, { session });
        await this.audit(type, ItemId, 'delete', before, { ...before, ...updates }, String(admin._id), session);
      });
    } finally { await session.endSession(); }
    return { IsSuccess: true, Data: { ItemId } };
  }

  async submitFeedback(dto: SubmitFeedbackDto, employee: User) {
    this.ensureEmployee(employee);
    const EmployeeId = String(employee._id);
    const model: Model<any> = dto.TargetType === 'work' ? this.workEntries : this.payments;
    if (!await model.exists({ _id: dto.TargetId, EmployeeId, IsDeleted: false })) {
      throw new ForbiddenException('The selected ledger entry does not belong to you');
    }
    const record = {
      _id: this.id(), EmployeeId, TargetType: dto.TargetType, TargetId: dto.TargetId,
      Explanation: dto.Explanation.trim(), Status: 'pending', CreatedDate: this.now(),
      RolesAllowedToRead: [UserRoles.Admin, UserRoles.Employee],
    };
    try { await this.feedback.create(record); }
    catch (error) {
      if ((error as any)?.code === 11000) throw new ConflictException('Feedback already exists for this entry');
      throw error;
    }
    return { IsSuccess: true, Data: { ItemId: record._id } };
  }

  async resolveFeedback(dto: ResolveFeedbackDto, admin: User) {
    this.ensureAdmin(admin);
    const result = await this.feedback.updateOne(
      { _id: dto.FeedbackId, Status: 'pending' },
      { $set: { Status: dto.Status, ResolutionNote: dto.ResolutionNote.trim(), ResolvedBy: String(admin._id), ResolvedAt: this.now(), AdminReadAt: this.now() } },
    );
    if (result.matchedCount !== 1) throw new ConflictException('Feedback is missing or already resolved');
    return { IsSuccess: true, Data: { ItemId: dto.FeedbackId, Status: dto.Status } };
  }

  async listNotifications(dto: ListNotificationsDto, admin: User) {
    this.ensureAdmin(admin);
    const filter = dto.Status === 'unread' ? { AdminReadAt: { $exists: false } } : {};
    const records = await this.feedback.find(filter).sort({ CreatedDate: -1 })
      .skip((dto.Page - 1) * dto.Size).limit(dto.Size).lean();
    const employeeIds = [...new Set(records.map((item: any) => item.EmployeeId))];
    const employees = await this.users.find({ _id: { $in: employeeIds } }).select('_id DisplayName').lean();
    const names = new Map(employees.map((item: any) => [String(item._id), item.DisplayName]));
    return {
      IsSuccess: true,
      Data: records.map((item: any) => ({ ...item, ItemId: item._id, EmployeeName: names.get(item.EmployeeId) || 'Employee' })),
      TotalCount: await this.feedback.countDocuments(filter),
    };
  }

  async markNotificationRead(FeedbackId: string, admin: User) {
    this.ensureAdmin(admin);
    const result = await this.feedback.updateOne({ _id: FeedbackId }, { $set: { AdminReadAt: this.now() } });
    if (result.matchedCount !== 1) throw new NotFoundException('Notification not found');
    return { IsSuccess: true, Data: { ItemId: FeedbackId } };
  }
}
