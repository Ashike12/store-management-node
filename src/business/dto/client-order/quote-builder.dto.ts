import { IsIn, IsInt, IsObject, Max, Min } from 'class-validator';
import { ORDER_LIMITS } from '../../../shared/constant/order-validation.constant';

export class QuoteBuilderDto {
  @IsIn(['MosquitoNet'])
  BuildType: 'MosquitoNet';

  @IsInt()
  @Min(1)
  @Max(ORDER_LIMITS.quantity)
  Quantity: number;

  // The shared checkout parser validates the named builder fields and ranges.
  @IsObject()
  CustomOptions: Record<string, string>;
}
