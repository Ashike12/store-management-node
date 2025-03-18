import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class SetPasswordDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  readonly Password: string;

  @IsNotEmpty()
  @IsString()
  readonly ActivationId: string;
}
