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
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  BD_MOBILE_PATTERN,
  normalizeOrderPhone,
} from '../../../shared/constant/order-payment.constant';

export const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
];

export const ORDER_UPDATE_CHANNELS = [
  'Email',
  'PhoneCall',
  'Messaging',
] as const;

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

export class UpdateOrderInfoDto extends OrderDetailsDto {
  @IsInt() @Min(0) ExpectedVersion: number;

  @IsString() @IsNotEmpty() @MaxLength(100) CustomerName: string;

  @IsString()
  @Transform(({ value }) => normalizeOrderPhone(value))
  @Matches(BD_MOBILE_PATTERN, {
    message: 'A valid Bangladesh mobile number is required',
  })
  PhoneNumber: string;

  @IsString() @IsNotEmpty() @MaxLength(100) Division: string;
  @IsString() @IsNotEmpty() @MaxLength(100) District: string;
  @IsString() @IsNotEmpty() @MaxLength(150) Area: string;
  @IsString() @IsNotEmpty() @MaxLength(20) PostCode: string;
  @IsString() @IsNotEmpty() @MaxLength(500) Address: string;
  @IsOptional() @IsString() @MaxLength(1000) DeliveryNotes?: string;
  @IsIn(['inside_dhaka', 'outside_dhaka']) DeliveryZone: string;
  @IsIn(ORDER_UPDATE_CHANNELS)
  UpdateDoneBy: (typeof ORDER_UPDATE_CHANNELS)[number];
  @IsOptional() @IsString() @MaxLength(1000) Note?: string;
}
