import { Type } from 'class-transformer';
import {
  IsEmail,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateEmployeeDto {
  @IsString() @IsNotEmpty() @MaxLength(80) FirstName: string;
  @IsString() @IsNotEmpty() @MaxLength(80) LastName: string;
  @IsOptional() @IsString() @MaxLength(120) DisplayName?: string;
  @IsEmail() Email: string;
  @IsString() @IsNotEmpty() @MaxLength(30) Phone: string;
  @IsString() @IsNotEmpty() @MaxLength(200) Address: string;
  @IsString() @IsNotEmpty() @MaxLength(100) Password: string;
}

export class ListEmployeesDto {
  @IsOptional() @IsString() SearchTerm?: string;
  @IsOptional() @IsIn(['all', 'active', 'inactive']) Status?: string = 'active';
  @Type(() => Number) @IsInt() @Min(1) Page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) Size = 20;
}

export class UpdateEmployeeDto {
  @IsString() @IsNotEmpty() ItemId: string;
  @IsOptional() @IsString() @MaxLength(80) FirstName?: string;
  @IsOptional() @IsString() @MaxLength(80) LastName?: string;
  @IsOptional() @IsString() @MaxLength(120) DisplayName?: string;
  @IsOptional() @IsString() @MaxLength(30) Phone?: string;
  @IsOptional() @IsString() @MaxLength(200) Address?: string;
  @IsOptional() @IsBoolean() Active?: boolean;
}

export class EmployeeIdDto {
  @IsString() @IsNotEmpty() EmployeeId: string;
}

export class EmployeeOverviewDto {
  @IsOptional() @IsString() EmployeeId?: string;
}

export class CreateWorkEntryDto extends EmployeeIdDto {
  @IsString() @IsNotEmpty() WorkDate: string;
  @IsString() @IsNotEmpty() @MaxLength(500) Description: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) Amount: number;
  @IsOptional() @IsString() BatchId?: string;
}

export class UpdateWorkEntryDto {
  @IsString() @IsNotEmpty() ItemId: string;
  @IsOptional() @IsString() WorkDate?: string;
  @IsOptional() @IsString() @MaxLength(500) Description?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) Amount?: number;
  @IsOptional() @IsString() BatchId?: string;
}

export class CreatePaymentEntryDto extends EmployeeIdDto {
  @IsString() @IsNotEmpty() PaymentDate: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) Amount: number;
  @IsOptional() @IsString() @MaxLength(500) Note?: string;
  @IsOptional() @IsString() @MaxLength(120) Reference?: string;
}

export class UpdatePaymentEntryDto {
  @IsString() @IsNotEmpty() ItemId: string;
  @IsOptional() @IsString() PaymentDate?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) Amount?: number;
  @IsOptional() @IsString() @MaxLength(500) Note?: string;
  @IsOptional() @IsString() @MaxLength(120) Reference?: string;
}

export class LedgerItemDto {
  @IsString() @IsNotEmpty() ItemId: string;
}

export class SubmitFeedbackDto {
  @IsIn(['work', 'payment']) TargetType: 'work' | 'payment';
  @IsString() @IsNotEmpty() TargetId: string;
  @IsString() @IsNotEmpty() @MaxLength(1000) Explanation: string;
}

export class ResolveFeedbackDto {
  @IsString() @IsNotEmpty() FeedbackId: string;
  @IsIn(['accepted', 'declined']) Status: 'accepted' | 'declined';
  @IsString() @IsNotEmpty() @MaxLength(1000) ResolutionNote: string;
}

export class ListNotificationsDto {
  @IsOptional() @IsIn(['all', 'unread']) Status?: string = 'unread';
  @Type(() => Number) @IsInt() @Min(1) Page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) Size = 20;
}

export class NotificationDto {
  @IsString() @IsNotEmpty() FeedbackId: string;
}
