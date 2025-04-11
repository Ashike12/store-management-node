import { IsNotEmpty, IsDate, IsString } from 'class-validator';
import { INVOICE_CONSTANT } from 'src/shared/constant/invoice.constant';
export class CreateInvoiceDto {
  @IsNotEmpty()
  readonly ProductSellInfo: ProductSellDto[];

  @IsNotEmpty()
  readonly PaymentAmount: number;

  readonly WholeSalerId: string;

  @IsNotEmpty()
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
