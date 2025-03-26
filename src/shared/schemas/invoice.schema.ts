import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { RootSchema } from './root.schema';

@Schema({
  timestamps: true,
})
export class Invoice extends RootSchema {
  @Prop()
  WholeSalerId: string;

  @Prop()
  WholeSalerName: string;

  @Prop()
  InvoiceNumber: string;

  @Prop()
  TotalAmount: number;

  @Prop()
  PaymentAmount: number;

  @Prop()
  ProfitMargin: number;

}

export const InvoiceSchema = SchemaFactory.createForClass(Invoice);
