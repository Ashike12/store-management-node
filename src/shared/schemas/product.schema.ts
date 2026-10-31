import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { RootSchema } from './root.schema';

@Schema({
  timestamps: true,
})
export class Product extends RootSchema {
  @Prop()
  CreationRequestId: string;

  @Prop()
  CreationRequestHash: string;

  @Prop()
  ProductName: string;

  @Prop()
  Category: string;

  @Prop()
  SubCategory: string;

  @Prop()
  NetHeight: string;

  @Prop({ default: 'feet', enum: ['feet'] })
  NetHeightUnit: string;

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

  @Prop({ default: 0, min: 0, max: 5 })
  AverageRating: number;

  @Prop({ default: 0, min: 0 })
  ReviewCount: number;

  @Prop({ default: false })
  QrVerificationEnabled: boolean;

  @Prop()
  QrVerificationToken?: string;
}

export const ProductSchema = SchemaFactory.createForClass(Product);

ProductSchema.index(
  { CreationRequestId: 1 },
  {
    unique: true,
    partialFilterExpression: { CreationRequestId: { $type: 'string' } },
  },
);

ProductSchema.index(
  { QrVerificationToken: 1 },
  {
    unique: true,
    partialFilterExpression: { QrVerificationToken: { $type: 'string' } },
  },
);
