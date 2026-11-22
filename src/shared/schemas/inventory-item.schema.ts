import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { RootSchema } from './root.schema';

@Schema({ timestamps: true, collection: 'inventoryitems' })
export class InventoryItem extends RootSchema {
  @Prop({ required: true, unique: true, index: true })
  SerialNumber: string;

  @Prop({ required: true, index: true })
  BatchId: string;

  @Prop({ required: true, index: true })
  ProductId: string;

  @Prop({ required: true, min: 1 })
  UnitIndex: number;

  /** Opaque public QR token for this single unit; never derived from the serial. */
  @Prop()
  QrToken?: string;
}

export const InventoryItemSchema = SchemaFactory.createForClass(InventoryItem);

InventoryItemSchema.index({ BatchId: 1, UnitIndex: 1 }, { unique: true });
InventoryItemSchema.index({ ProductId: 1, BatchId: 1 });
InventoryItemSchema.index(
  { QrToken: 1 },
  { unique: true, partialFilterExpression: { QrToken: { $type: 'string' } } },
);
