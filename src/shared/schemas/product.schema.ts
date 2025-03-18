import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { RootSchema } from './root.schema';

@Schema({
  timestamps: true,
})
export class Product extends RootSchema {
  @Prop()
  ProductName: string;

  @Prop()
  Description: string;

  @Prop()
  MakingPrice: number;

  @Prop()
  SellingPrice: number;

  @Prop()
  Quantity: number;

}

export const ProductSchema = SchemaFactory.createForClass(Product);
