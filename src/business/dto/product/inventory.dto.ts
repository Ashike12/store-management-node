import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

export class ListProductBatchesDto {
  @IsString()
  @IsNotEmpty()
  ProductId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  Page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  Size = 10;
}

export class ListBatchItemsDto {
  @IsString()
  @IsNotEmpty()
  BatchId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  Page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  Size = 25;
}
