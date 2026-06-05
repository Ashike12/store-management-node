
import {
  IsNotEmpty,
  IsString,
} from 'class-validator';

export class UpdateUserDto {
  @IsNotEmpty()
  @IsString()
  readonly ItemId: string;
  
  readonly FirstName: string;
  readonly LastName: string;
  readonly DisplayName: string;
  readonly Email: string;
  readonly Phone: string;
  readonly DateOfBirth: Date;
  readonly NRIC: string;
  readonly Address: string;
  readonly CBC: string;
  readonly Finance: number;
  readonly Active: boolean;
  readonly Password: string;
}
