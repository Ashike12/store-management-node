import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class CreateClientOrderItemDto {
  @IsString()
  @IsNotEmpty()
  readonly ProductId: string;

  @IsString()
  @IsNotEmpty()
  readonly ProductName: string;

  @IsString()
  @IsNotEmpty()
  readonly Category: string;

  @IsString()
  @IsNotEmpty()
  readonly SubCategory: string;

  @IsArray()
  @IsString({ each: true })
  readonly ImageLinks: string[];

  @IsNumber()
  readonly UnitPrice: number;

  @IsNumber()
  readonly Quantity: number;

  @IsOptional()
  @IsObject()
  readonly CustomOptions?: Record<string, string>;
}

export class CreateClientOrderDto {
  @IsString()
  @IsNotEmpty()
  readonly CustomerName: string;

  @IsString()
  @IsNotEmpty()
  readonly PhoneNumber: string;

  @IsString()
  @IsNotEmpty()
  readonly Division: string;

  @IsString()
  @IsNotEmpty()
  readonly District: string;

  @IsString()
  @IsNotEmpty()
  readonly Area: string;

  @IsString()
  @IsNotEmpty()
  readonly PostCode: string;

  @IsString()
  @IsNotEmpty()
  readonly Address: string;

  @IsOptional()
  @IsString()
  readonly DeliveryNotes?: string;

  @IsString()
  @IsIn(['inside_dhaka', 'outside_dhaka'])
  readonly DeliveryZone: 'inside_dhaka' | 'outside_dhaka';

  @IsOptional()
  @IsString()
  readonly CouponCode?: string;

  @IsString()
  @IsNotEmpty()
  readonly CaptchaToken: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateClientOrderItemDto)
  readonly Items: CreateClientOrderItemDto[];
}
