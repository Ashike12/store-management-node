import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { InventoryBatch, InventoryBatchSchema } from '../shared/schemas/inventory-batch.schema';
import { User, UserSchema } from '../shared/schemas/user.schema';
import { EmployeeController } from './employee.controller';
import { EmployeeService } from './employee.service';
import { EmployeeFeedback, EmployeeFeedbackSchema } from './schemas/employee-feedback.schema';
import { EmployeeLedgerAudit, EmployeeLedgerAuditSchema } from './schemas/employee-ledger-audit.schema';
import { EmployeePaymentEntry, EmployeePaymentEntrySchema } from './schemas/employee-payment-entry.schema';
import { EmployeeWorkEntry, EmployeeWorkEntrySchema } from './schemas/employee-work-entry.schema';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: InventoryBatch.name, schema: InventoryBatchSchema },
      { name: EmployeeWorkEntry.name, schema: EmployeeWorkEntrySchema },
      { name: EmployeePaymentEntry.name, schema: EmployeePaymentEntrySchema },
      { name: EmployeeFeedback.name, schema: EmployeeFeedbackSchema },
      { name: EmployeeLedgerAudit.name, schema: EmployeeLedgerAuditSchema },
    ]),
  ],
  controllers: [EmployeeController],
  providers: [EmployeeService],
  exports: [EmployeeService],
})
export class EmployeeModule {}
