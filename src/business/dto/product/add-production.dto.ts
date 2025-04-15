import { IsArray, IsNotEmpty, IsString } from 'class-validator';
export class AddProductionDto {
    @IsArray()
    readonly ProductionInfo: AddProduction[]
}

export class AddProduction {
    @IsString()
    @IsNotEmpty()
    readonly ProductId: string;

    @IsString()
    @IsNotEmpty()
    readonly Quantity: number;
}
