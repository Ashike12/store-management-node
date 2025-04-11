
import {
  IsNotEmpty,
  IsString,
} from 'class-validator';

export class GetInvoiceDto {
  @IsString()
  readonly ItemId: string;

  readonly WholesalerId?: string = null;
}

