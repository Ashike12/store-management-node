import { IsEmail, IsNotEmpty, isString, IsString, MinLength } from 'class-validator';

export class UpdateUserDto {

  @IsString()
  @IsNotEmpty()
  readonly _id: string;

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

  readonly Password: string;
}
