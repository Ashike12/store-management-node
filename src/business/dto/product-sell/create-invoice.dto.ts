import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { INVOICE_CONSTANT } from '../../../shared/constant/invoice.constant';
import { ORDER_LIMITS } from '../../../shared/constant/order-validation.constant';
export class CreateInvoiceDto {
  @IsArray()
  @ArrayMaxSize(ORDER_LIMITS.items)
  @ValidateNested({ each: true })
  @Type(() => ProductSellDto)
  readonly ProductSellInfo: ProductSellDto[] = [];

  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 6 })
  @Min(0)
  @Max(ORDER_LIMITS.items * ORDER_LIMITS.quantity * ORDER_LIMITS.unitPrice)
  readonly PaymentAmount: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  readonly WholeSalerId: string;

  @IsNotEmpty()
  @IsIn([
    INVOICE_CONSTANT.WHOLESALE,
    INVOICE_CONSTANT.CONSUMER,
    INVOICE_CONSTANT.DUE_PAYMENT,
  ])
  readonly InvoiceType: string = INVOICE_CONSTANT.WHOLESALE;
}

export class ProductSellDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  readonly ProductId: string;

  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 6 })
  @Min(0)
  @Max(ORDER_LIMITS.unitPrice)
  readonly SellingPrice: number;

  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 6 })
  @Min(0.000001)
  @Max(ORDER_LIMITS.quantity)
  readonly Quantity: number;
}
