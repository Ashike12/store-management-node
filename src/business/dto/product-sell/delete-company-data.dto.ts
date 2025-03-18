
import {
  IsNotEmpty,
  IsString,
} from 'class-validator';

export class DeleteCompanyDataDto {
  @IsNotEmpty()
  @IsString()
  readonly ItemId: string;
}
