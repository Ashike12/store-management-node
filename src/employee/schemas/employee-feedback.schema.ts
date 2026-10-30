import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { RootSchema } from '../../shared/schemas/root.schema';

@Schema({ timestamps: true, collection: 'employeefeedback' })
export class EmployeeFeedback extends RootSchema {
  @Prop({ required: true, index: true }) EmployeeId: string;
  @Prop({ required: true, enum: ['work', 'payment'] }) TargetType: string;
  @Prop({ required: true, index: true }) TargetId: string;
  @Prop({ required: true }) Explanation: string;
  @Prop({ required: true, default: 'pending', index: true }) Status: string;
  @Prop() ResolutionNote?: string;
  @Prop() ResolvedBy?: string;
  @Prop() ResolvedAt?: string;
  @Prop() AdminReadAt?: string;
}

export const EmployeeFeedbackSchema = SchemaFactory.createForClass(EmployeeFeedback);
EmployeeFeedbackSchema.index(
  { EmployeeId: 1, TargetType: 1, TargetId: 1 },
  { unique: true },
);
