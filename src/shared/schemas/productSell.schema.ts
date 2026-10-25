import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { RootSchema } from './root.schema';

@Schema({
  timestamps: true,
})
export class ProductSell extends RootSchema {
  @Prop({ required: true })
  ProductId: string;

  @Prop({ required: true })
  ProductName: string;

  @Prop({ required: true, min: 0 })
  SellingPrice: number;

  @Prop({ required: true, min: 0.000001 })
  Quantity: number;

  @Prop()
  SellingDate: Date;

  @Prop({ default: '' })
  WholeSalerId: string;

  @Prop({ default: '' })
  WholeSalerName: string;

  @Prop({ required: true })
  InvoiceId: string;
}

export const ProductSellSchema = SchemaFactory.createForClass(ProductSell);
ProductSellSchema.index({ InvoiceId: 1 });
ProductSellSchema.index({ WholeSalerId: 1, CreatedDate: -1 });
