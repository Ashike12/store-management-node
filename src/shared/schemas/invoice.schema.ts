import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { RootSchema } from './root.schema';

@Schema({
  timestamps: true,
})
export class Invoice extends RootSchema {
  @Prop({ default: '' })
  WholeSalerId: string;

  @Prop({ default: '' })
  WholeSalerName: string;

  @Prop({ required: true })
  InvoiceNumber: string;

  @Prop({ required: true, min: 0 })
  TotalAmount: number;

  @Prop({ required: true, min: 0 })
  PaymentAmount: number;

  @Prop({ required: true })
  ProfitMargin: number;

  @Prop({
    required: true,
    enum: ['WHOLESALE', 'CONSUMER', 'DUE_PAYMENT'],
  })
  InvoiceType: string;
}

export const InvoiceSchema = SchemaFactory.createForClass(Invoice);
InvoiceSchema.index({ InvoiceNumber: 1 }, { unique: true });
InvoiceSchema.index({ WholeSalerId: 1, CreatedDate: -1, _id: -1 });
