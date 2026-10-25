import { IsOptional, IsString, MaxLength } from 'class-validator';

export class GetInvoiceDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  readonly ItemId: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  readonly WholesalerId?: string = null;
}
