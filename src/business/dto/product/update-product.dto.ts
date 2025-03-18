import { IsNotEmpty, IsString } from 'class-validator';
export class UpdateProductDto {
  @IsString()
  @IsNotEmpty()
  readonly ItemId: string;

  readonly ProductName: string;

  readonly MakingPrice: number;

  readonly SellingPrice: number;

  readonly Quantity: number;
  
  readonly Description: string;
}
