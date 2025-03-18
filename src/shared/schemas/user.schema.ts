import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { RootSchema } from './root.schema';

@Schema({
  timestamps: true,
})
export class User extends RootSchema {

  @Prop()
  FirstName: string;

  @Prop()
  LastName: string;

  @Prop()
  DisplayName: string;

  @Prop()
  Email: string;

  @Prop()
  Phone: string;

  @Prop()
  Password: string;

  @Prop()
  ActivationId: string;

  @Prop()
  ActivationIdExpiry: Date;

  @Prop()
  Active: boolean;

  @Prop()
  Roles: string[];

  @Prop()
  DateOfBirth: Date;

  @Prop()
  NRIC: string;

  @Prop()
  Finance: number;

  @Prop()
  Address: string;

}

export const UserSchema = SchemaFactory.createForClass(User);
