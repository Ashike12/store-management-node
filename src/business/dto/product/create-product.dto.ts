import { IsIn } from 'class-validator';
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
} from 'class-validator';
export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  readonly RequestId: string;

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

  @IsOptional()
  @IsString()
  readonly NetHeight: string;

  @IsOptional()
  @IsIn(['feet'])
  readonly NetHeightUnit?: 'feet';

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

  @IsInt()
  @Min(0)
  @Max(10000)
  @IsNotEmpty()
  readonly Quantity: number;

  @IsOptional()
  @IsString()
  readonly MadeByEmployeeId?: string;
}
