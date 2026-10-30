import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { RootSchema } from '../../shared/schemas/root.schema';

@Schema({ timestamps: true, collection: 'employeepaymententries' })
export class EmployeePaymentEntry extends RootSchema {
  @Prop({ required: true, index: true }) EmployeeId: string;
  @Prop({ required: true, index: true }) PaymentDate: string;
  @Prop({ required: true, min: 1 }) AmountPaisa: number;
  @Prop() Note?: string;
  @Prop() Reference?: string;
  @Prop({ default: false, index: true }) IsDeleted: boolean;
  @Prop({ required: true }) CreatedBy: string;
  @Prop() UpdatedBy?: string;
  @Prop() UpdatedDate?: string;
}

export const EmployeePaymentEntrySchema = SchemaFactory.createForClass(EmployeePaymentEntry);
EmployeePaymentEntrySchema.index({ EmployeeId: 1, PaymentDate: -1, IsDeleted: 1 });
