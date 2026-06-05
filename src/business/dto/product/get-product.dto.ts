import { IsNumber, IsOptional, IsString } from 'class-validator';
export class GetProductDto {
  @IsOptional()
  @IsString()
  readonly ItemId: string;

  @IsOptional()
  @IsString()
  readonly Category: string;

  @IsOptional()
  @IsString()
  readonly SubCategory: string;

  @IsOptional()
  @IsNumber()
  readonly MinMakingPrice: number;

  @IsOptional()
  @IsNumber()
  readonly MaxMakingPrice: number;

  @IsOptional()
  @IsString()
  readonly SearchTerm: string;
}
