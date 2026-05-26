import { Prop } from "@nestjs/mongoose";

export class RootSchema {
    @Prop()
    _id: string;

    @Prop()
    CreatedDate: string;

    @Prop()
    RolesAllowedToRead?: string[];

    @Prop()
    RolesAllowedToWrite?: string[];

    @Prop()
    RolesAllowedToUpdate?: string[];

    @Prop()
    RolesAllowedToDelete?: string[];

    @Prop()
    IdsAllowedToRead?: string[];

    @Prop()
    IdsAllowedToWrite?: string[];
    
    @Prop()
    IdsAllowedToUpdate?: string[];

    @Prop()
    IdsAllowedToDelete?: string[];
}
