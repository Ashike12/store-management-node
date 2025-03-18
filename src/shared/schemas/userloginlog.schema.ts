import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { RootSchema } from './root.schema';

@Schema({
  timestamps: true,
})
export class UserLoginLog extends RootSchema {

  @Prop()
  UserId: string;

  @Prop()
  DisplayName: string;

  @Prop()
  LoginTime: Date;
}

export const UserLoginLogSchema = SchemaFactory.createForClass(UserLoginLog);
