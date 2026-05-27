import { IsArray, IsNotEmpty, IsString } from 'class-validator';
export class UpdateProductDto {
  @IsString()
  @IsNotEmpty()
  readonly ItemId: string;

  readonly ProductName: string;

  readonly Category: string;

  readonly SubCategory: string;

  @IsArray()
  @IsString({ each: true })
  readonly ImageLinks: string[];

  readonly VideoLink: string;

  readonly MakingPrice: number;

  readonly WholeSalerPrice: number;

  readonly EndUserPrice: number;

  readonly EndUserDiscountedPrice: number;

  Quantity: number;
  
  readonly Description: string;
}
