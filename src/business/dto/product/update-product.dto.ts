import { IsArray, IsNotEmpty, IsString } from 'class-validator';
export class UpdateProductDto {
  @IsString()
  @IsNotEmpty()
  readonly ItemId: string;

  readonly ProductName: string;

  @IsArray()
  @IsString({ each: true })
  readonly ImageLinks: string[];

  readonly VideoLink: string;

  readonly MakingPrice: number;

  readonly SellingPrice: number;

  Quantity: number;
  
  readonly Description: string;
}
