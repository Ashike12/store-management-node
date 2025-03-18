import { IsEmail, IsNotEmpty, IsNumber, IsString, MinLength } from 'class-validator';

export class SignUpDto {
  @IsString()
  readonly FirstName: string;

  @IsString()
  readonly LastName: string;

  readonly DisplayName: string;

  @IsString()
  readonly Phone: string;

  @IsNotEmpty()
  @IsEmail({}, { message: 'Please enter correct email' })
  readonly Email: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  readonly Password: string;

  @IsNotEmpty()
  readonly Roles: string[]

  readonly DateOfBirth: Date;
  @IsString()
  readonly NRIC: string;
  @IsString()
  readonly Address: string;
  @IsString()
  readonly CBC: string;
  @IsNumber()
  readonly Finance: number;
  readonly CapitalGainTax: boolean;
}
