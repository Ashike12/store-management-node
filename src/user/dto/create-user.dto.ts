import {
  IsEmail,
  isNotEmpty,
  IsNotEmpty,
  IsNumber,
  IsString,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  readonly FirstName: string;

  @IsString()
  readonly LastName: string;

  @IsString()
  readonly Phone: string;

  readonly DisplayName: string;

  @IsNotEmpty()
  @IsEmail({}, { message: 'Please enter correct email' })
  readonly Email: string;

  readonly DateOfBirth: Date;
  readonly Address: string;
  @IsNotEmpty()
  @IsString()
  readonly Password: string;
}
