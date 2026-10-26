import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
export class AddProductionDto {
  @IsString()
  @IsNotEmpty()
  readonly RequestId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AddProduction)
  readonly ProductionInfo: AddProduction[];
}

export class AddProduction {
  @IsString()
  @IsNotEmpty()
  readonly ProductId: string;

  @IsInt()
  @Min(1)
  @Max(10000)
  readonly Quantity: number;
}
