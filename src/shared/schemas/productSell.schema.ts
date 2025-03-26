import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { RootSchema } from './root.schema';

@Schema({
  timestamps: true,
})
export class ProductSell extends RootSchema {
  @Prop()
  ProductId: string;

  @Prop()
  ProductName: string;

  @Prop()
  SellingPrice: number;

  @Prop()
  Quantity: number;

  @Prop()
  SellingDate: Date;

  @Prop()
  WholeSalerId: string;

  @Prop()
  WholeSalerName: string;

  @Prop()
  InvoiceId: string;
}

export const ProductSellSchema = SchemaFactory.createForClass(ProductSell);
