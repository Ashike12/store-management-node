import { IsEmail, isNotEmpty, IsNotEmpty, IsString, MinLength, ValidateIf } from 'class-validator';

export class LoginDto {
  @ValidateIf((o) => o.GrantType === 'password')
  @IsNotEmpty()
  @IsEmail({}, { message: 'Please enter correct email' })
  readonly Email: string;

  @ValidateIf((o) => o.GrantType === 'password')
  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  readonly Password: string;

  @IsNotEmpty()
  @IsString()
  readonly GrantType: string;
}
