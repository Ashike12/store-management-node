
import {
  IsNotEmpty,
  IsString,
} from 'class-validator';

export class GetInvoiceDto {
  @IsNotEmpty()
  @IsString()
  readonly ItemId: string;
}

