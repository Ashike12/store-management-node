import { IsNotEmpty, IsDate, IsString, IsNumber } from 'class-validator';
export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  readonly ProductName: string;

  @IsString()
  @IsNotEmpty()
  readonly Description: string;

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
