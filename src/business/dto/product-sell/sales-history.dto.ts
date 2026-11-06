import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const SALES_PERIODS = [
  'daily',
  'last7Days',
  'last30Days',
  'currentMonth',
] as const;

export type SalesPeriod = (typeof SALES_PERIODS)[number];

export class GetSalesHistoryDto {
  @IsIn(SALES_PERIODS)
  readonly Period: SalesPeriod = 'daily';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  readonly SoldByUserId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  readonly Page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  readonly Size: number = 10;
}
