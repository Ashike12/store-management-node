import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  readonly RefreshToken: string;
}
