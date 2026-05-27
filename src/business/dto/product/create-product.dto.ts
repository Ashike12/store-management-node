import { IsArray, IsNotEmpty, IsNumber, IsString } from 'class-validator';
export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  readonly ProductName: string;

  @IsString()
  @IsNotEmpty()
  readonly Description: string;

  @IsArray()
  @IsString({ each: true })
  readonly ImageLinks: string[];

  @IsString()
  @IsNotEmpty()
  readonly VideoLink: string;

  @IsNumber()
  @IsNotEmpty()
  readonly MakingPrice: number;

  @IsNumber()
  @IsNotEmpty()
  readonly SellingPrice: number;

  @IsNumber()
  @IsNotEmpty()
  readonly Quantity: number;
}
