import { IsOptional, IsString } from 'class-validator';

export class GenerateAiSuggestionDto {
  @IsString()
  readonly FieldName: string;

  @IsOptional()
  @IsString()
  readonly CurrentValue?: string;

  @IsOptional()
  @IsString()
  readonly ProductName?: string;

  @IsOptional()
  @IsString()
  readonly Category?: string;

  @IsOptional()
  @IsString()
  readonly SubCategory?: string;
}
