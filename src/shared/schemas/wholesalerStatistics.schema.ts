import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { RootSchema } from './root.schema';

@Schema({
  timestamps: true,
})
export class WholesalerStatistics extends RootSchema {
  @Prop()
  WholesalerId: string;

  @Prop()
  TotalBuyingAmount: number;

  @Prop()
  TotalPaymentGiven: number;

  @Prop()
  RemainingPayment: number;

}

export const WholesalerStatisticsSchema = SchemaFactory.createForClass(WholesalerStatistics);
