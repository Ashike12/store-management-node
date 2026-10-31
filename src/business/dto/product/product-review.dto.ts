import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ListProductReviewsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  ProductId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  Page: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  Size: number;
}

export class CreateProductReviewDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  ProductId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  Rating: number;

  @IsString()
  @MinLength(5)
  @MaxLength(1200)
  Comment: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUrl({ require_protocol: true }, { each: true })
  MediaUrls?: string[];
}
