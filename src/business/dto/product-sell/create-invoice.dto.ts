import { IsIn, IsNotEmpty } from 'class-validator';
import { INVOICE_CONSTANT } from '../../../shared/constant/invoice.constant';
export class CreateInvoiceDto {
  readonly ProductSellInfo: ProductSellDto[] = [];

  @IsNotEmpty()
  readonly PaymentAmount: number;

  readonly WholeSalerId: string;

  @IsNotEmpty()
  @IsIn([INVOICE_CONSTANT.WHOLESALE, INVOICE_CONSTANT.CONSUMER, INVOICE_CONSTANT.DUE_PAYMENT])
  readonly InvoiceType: string = INVOICE_CONSTANT.WHOLESALE;
}

export class ProductSellDto {

  @IsNotEmpty()
  readonly ProductId: string;

  @IsNotEmpty()
  readonly SellingPrice: number;

  @IsNotEmpty()
  readonly Quantity: number;
}
