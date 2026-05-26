import { IsIn, IsNotEmpty } from 'class-validator';
import { INVOICE_CONSTANT } from 'src/shared/constant/invoice.constant';
export class UpdateInvoiceDto {
  @IsNotEmpty()
  readonly ItemId: string;
  
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
  readonly ItemId: string;

  @IsNotEmpty()
  readonly ProductId: string;

  @IsNotEmpty()
  readonly SellingPrice: number;

  @IsNotEmpty()
  readonly Quantity: number;
}
