import { IsNotEmpty, IsDate, IsString } from 'class-validator';
export class SendMailDto {
  @IsNotEmpty()
  @IsString()
  readonly Name: string;

  @IsNotEmpty()
  @IsString()
  readonly Email: string;

  @IsNotEmpty()
  @IsString()
  readonly Subject: string;

  @IsNotEmpty()
  @IsString()
  readonly Phone: string;

  @IsNotEmpty()
  @IsString()
  readonly CompanyName: string;

  @IsNotEmpty()
  @IsString()
  readonly Message: string;
}
