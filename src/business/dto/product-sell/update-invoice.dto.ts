import { IsNotEmpty } from 'class-validator';
export class UpdateInvoiceDto {
  @IsNotEmpty()
  readonly ItemId: string;
  
  @IsNotEmpty()
  readonly ProductSellInfo: ProductSellDto[];

  @IsNotEmpty()
  readonly PaymentAmount: number;

  @IsNotEmpty()
  readonly WholeSalerId: string;

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
