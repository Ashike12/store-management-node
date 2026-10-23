import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { RootSchema } from './root.schema';

export class OrderItemSnapshot {
  @Prop({ type: [Object], default: [] })
  InventoryRequirements: { ProductId: string; Quantity: number }[];

  @Prop()
  ProductId: string;

  @Prop()
  ProductName: string;

  @Prop()
  Category: string;

  @Prop()
  SubCategory: string;

  @Prop({ type: [String], default: [] })
  ImageLinks: string[];

  @Prop()
  UnitPrice: number;

  @Prop()
  Quantity: number;

  @Prop({ type: Object, default: {} })
  CustomOptions?: Record<string, string>;
}

@Schema({
  timestamps: true,
})
export class Order extends RootSchema {
  @Prop({ required: true }) RequestId: string;
  @Prop({ required: true }) RequestHash: string;
  @Prop() FormulaVersion: string;
  @Prop({ default: 'unpaid', enum: ['unpaid', 'paid', 'refunded'] })
  PaymentStatus: string;
  @Prop({ default: 0 }) Version: number;
  @Prop({ default: false }) StockDeducted: boolean;
  @Prop({ type: [Object], default: [] }) StockMovements: {
    ProductId: string;
    Quantity: number;
  }[];
  @Prop({ type: [Object], default: [] }) AuditHistory: {
    From: string;
    To: string;
    By: string;
    At: string;
    Note: string;
  }[];

  @Prop()
  OrderNumber: string;

  @Prop()
  CustomerName: string;

  @Prop()
  PhoneNumber: string;

  @Prop()
  Division: string;

  @Prop()
  District: string;

  @Prop()
  Area: string;

  @Prop()
  PostCode: string;

  @Prop()
  Address: string;

  @Prop()
  DeliveryNotes?: string;

  @Prop()
  DeliveryZone: string;

  @Prop()
  CouponCode?: string;

  @Prop()
  CouponDiscount: number;

  @Prop()
  ShippingCost: number;

  @Prop()
  Subtotal: number;

  @Prop()
  TotalAmount: number;

  @Prop()
  OrderStatus: string;

  @Prop({ type: [Object], default: [] })
  Items: OrderItemSnapshot[];

  @Prop()
  CaptchaVerifiedAt: string;

  @Prop()
  CaptchaHostname?: string;

  @Prop()
  CustomerIp?: string;
}

export const OrderSchema = SchemaFactory.createForClass(Order);

OrderSchema.index(
  { RequestId: 1 },
  { unique: true, partialFilterExpression: { RequestId: { $type: 'string' } } },
);
OrderSchema.index({ CreatedDate: -1, _id: -1 });
OrderSchema.index({ OrderStatus: 1, CreatedDate: -1 });
