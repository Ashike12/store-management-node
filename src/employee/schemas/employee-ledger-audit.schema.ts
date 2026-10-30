import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { RootSchema } from '../../shared/schemas/root.schema';

@Schema({ timestamps: true, collection: 'employeeledgeraudits' })
export class EmployeeLedgerAudit extends RootSchema {
  @Prop({ required: true, enum: ['work', 'payment'] }) EntityType: string;
  @Prop({ required: true, index: true }) EntityId: string;
  @Prop({ required: true, enum: ['create', 'update', 'delete'] }) Action: string;
  @Prop({ type: Object }) Before?: Record<string, unknown>;
  @Prop({ type: Object }) After?: Record<string, unknown>;
  @Prop({ required: true }) ChangedBy: string;
}

export const EmployeeLedgerAuditSchema = SchemaFactory.createForClass(EmployeeLedgerAudit);
