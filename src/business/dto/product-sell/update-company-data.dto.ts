
import {
  IsNotEmpty,
  IsString,
} from 'class-validator';

export class UpdateCompanyDataDto {
  @IsNotEmpty()
  @IsString()
  readonly ItemId: string;
  
  readonly MaturityValue: number;
  readonly USDBalance: number;
  readonly StartDate: Date;
  readonly EndDate: Date;
}

