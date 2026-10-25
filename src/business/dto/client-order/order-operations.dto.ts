import {
  IsDateString,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
];

export class ListOrdersDto {
  @IsOptional() @IsBoolean() NeedsAction?: boolean;
  @IsInt() @Min(1) Page = 1;
  @IsInt() @Min(1) @Max(100) Size = 10;
  @IsOptional() @IsIn(ORDER_STATUSES) Status?: string;
  @IsOptional() @IsString() @MaxLength(100) Search?: string;
  @IsOptional() @IsDateString() From?: string;
  @IsOptional() @IsDateString() To?: string;
}

export class OrderDetailsDto {
  @IsString() @IsNotEmpty() @MaxLength(100) ItemId: string;
}

export class TransitionOrderDto extends OrderDetailsDto {
  @IsIn(ORDER_STATUSES.filter((s) => s !== 'pending')) Status: string;
  @IsInt() @Min(0) ExpectedVersion: number;
  @IsOptional() @IsString() @MaxLength(1000) Note?: string;
}
