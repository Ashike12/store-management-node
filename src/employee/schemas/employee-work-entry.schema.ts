import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { RootSchema } from '../../shared/schemas/root.schema';

@Schema({ timestamps: true, collection: 'employeeworkentries' })
export class EmployeeWorkEntry extends RootSchema {
  @Prop({ required: true, index: true }) EmployeeId: string;
  @Prop({ required: true, index: true }) WorkDate: string;
  @Prop({ required: true }) Description: string;
  @Prop({ required: true, min: 1 }) AmountPaisa: number;
  @Prop({ index: true }) BatchId?: string;
  @Prop({ default: false, index: true }) IsDeleted: boolean;
  @Prop({ required: true }) CreatedBy: string;
  @Prop() UpdatedBy?: string;
  @Prop() UpdatedDate?: string;
}

export const EmployeeWorkEntrySchema = SchemaFactory.createForClass(EmployeeWorkEntry);
EmployeeWorkEntrySchema.index({ EmployeeId: 1, WorkDate: -1, IsDeleted: 1 });
