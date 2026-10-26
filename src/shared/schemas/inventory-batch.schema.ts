import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { RootSchema } from './root.schema';

@Schema({ timestamps: true, collection: 'inventorybatches' })
export class InventoryBatch extends RootSchema {
  @Prop({ required: true, unique: true, index: true })
  BatchId: string;

  @Prop({ required: true, index: true })
  ProductId: string;

  @Prop({ required: true, min: 1 })
  QuantityReceived: number;

  @Prop({ required: true })
  CreatedBy: string;

  @Prop({ required: true })
  RequestId: string;
}

export const InventoryBatchSchema =
  SchemaFactory.createForClass(InventoryBatch);

InventoryBatchSchema.index({ ProductId: 1, CreatedDate: -1 });
InventoryBatchSchema.index({ RequestId: 1, ProductId: 1 }, { unique: true });
