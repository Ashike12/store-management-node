import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  readonly ProductName: string;

  @IsString()
  @IsNotEmpty()
  readonly Description: string;

  @IsString()
  @IsNotEmpty()
  readonly Category: string;

  @IsString()
  @IsNotEmpty()
  readonly SubCategory: string;

  @IsArray()
  @IsString({ each: true })
  readonly ImageLinks: string[];

  @IsOptional()
  @IsString()
  readonly VideoLink: string;

  @IsNumber()
  @IsNotEmpty()
  readonly MakingPrice: number;

  @IsNumber()
  @IsNotEmpty()
  readonly WholeSalerPrice: number;

  @IsNumber()
  @IsNotEmpty()
  readonly EndUserPrice: number;

  @IsNumber()
  @IsNotEmpty()
  readonly EndUserDiscountedPrice: number;

  @IsNumber()
  @IsNotEmpty()
  readonly Quantity: number;
}
