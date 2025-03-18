import { IsNotEmpty, IsDate, IsString } from 'class-validator';
export class CreateInvoiceDto {
  @IsNotEmpty()
  readonly ProductSellInfo: ProductSellDto[];

  @IsNotEmpty()
  readonly PaymentAmount: number;

  @IsNotEmpty()
  readonly WholeSalerId: string;

}

export class ProductSellDto {

  @IsNotEmpty()
  readonly ProductId: string;

  @IsNotEmpty()
  readonly SellingPrice: number;

  @IsNotEmpty()
  readonly Quantity: number;

  @IsNotEmpty()
  readonly SellingDate: Date;
}
