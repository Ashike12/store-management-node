import { IsNotEmpty, IsString } from 'class-validator';
export class GetProductDto {
  @IsString()
  readonly ItemId: string;
}
