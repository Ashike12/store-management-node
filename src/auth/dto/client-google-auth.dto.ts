import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ClientGoogleAuthDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  Credential: string;
}
