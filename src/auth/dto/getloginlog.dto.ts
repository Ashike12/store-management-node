import { IsNotEmpty, IsDate, IsString } from 'class-validator';
export class GetLoginLogsDto {
  @IsNotEmpty()
  @IsString()
  readonly StartDate: Date;

  @IsNotEmpty()
  @IsString()
  readonly EndDate: Date;
}
