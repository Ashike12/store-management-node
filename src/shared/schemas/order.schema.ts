import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { RootSchema } from './root.schema';

export class OrderItemSnapshot {
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
