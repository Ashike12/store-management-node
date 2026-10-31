import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { RootSchema } from './root.schema';

@Schema({ timestamps: true, collection: 'productreviews' })
export class ProductReview extends RootSchema {
  @Prop({ required: true, index: true })
  UserId: string;

  @Prop({ required: true, index: true })
  ProductId: string;

  @Prop({ required: true, trim: true, maxlength: 80 })
  ReviewerName: string;

  @Prop({ required: true, min: 1, max: 5 })
  Rating: number;

  @Prop({ required: true, trim: true, maxlength: 1200 })
  Comment: string;

  @Prop({ type: [String], default: [] })
  MediaUrls: string[];

  @Prop({ default: false, index: true })
  IsDeleted: boolean;
}

export const ProductReviewSchema = SchemaFactory.createForClass(ProductReview);

ProductReviewSchema.index({ ProductId: 1, IsDeleted: 1, CreatedDate: -1 });
ProductReviewSchema.index({ ProductId: 1, UserId: 1 }, { unique: true });
