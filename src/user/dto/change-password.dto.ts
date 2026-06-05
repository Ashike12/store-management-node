import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsNotEmpty()
  @IsString()
  readonly CurrentPassword: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  readonly NewPassword: string;
}
