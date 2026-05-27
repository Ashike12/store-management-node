import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { RootSchema } from './root.schema';

@Schema({
  timestamps: true,
})
export class Product extends RootSchema {
  @Prop()
  ProductName: string;

  @Prop()
  Category: string;

  @Prop()
  SubCategory: string;

  @Prop()
  Description: string;

  @Prop({ type: [String], default: [] })
  ImageLinks: string[];

  @Prop()
  VideoLink: string;

  @Prop()
  MakingPrice: number;

  @Prop()
  WholeSalerPrice: number;

  @Prop()
  EndUserPrice: number;

  @Prop()
  EndUserDiscountedPrice: number;

  @Prop()
  Quantity: number;

}

export const ProductSchema = SchemaFactory.createForClass(Product);
