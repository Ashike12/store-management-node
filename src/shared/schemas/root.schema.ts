import { Prop } from "@nestjs/mongoose";
import { Document } from 'mongoose';

export class RootSchema extends Document {
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