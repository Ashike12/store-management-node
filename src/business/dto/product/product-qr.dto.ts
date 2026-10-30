import {
  IsIn,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class ConfigureProductQrDto {
  @IsString()
  @IsNotEmpty()
  readonly ItemId: string;

  @IsIn(['enable', 'disable', 'rotate'])
  readonly Action: 'enable' | 'disable' | 'rotate';
}

export class VerifyProductQrDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[A-Za-z0-9_-]+$/)
  readonly Token: string;
}
