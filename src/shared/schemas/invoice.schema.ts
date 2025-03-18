import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { RootSchema } from './root.schema';

@Schema({
  timestamps: true,
})
export class Invoice extends RootSchema {
  @Prop()
  WholesalerId: string;

  @Prop()
  TotalAmount: number;

  @Prop()
  PaymentAmount: number;

  @Prop()
  ProfitMargin: number;

  @Prop()
  WholeSalerId: string;

}

export const InvoiceSchema = SchemaFactory.createForClass(Invoice);
