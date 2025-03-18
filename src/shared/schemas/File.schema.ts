import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { RootSchema } from './root.schema';

@Schema({
  timestamps: true,
})
export class FileInfo extends RootSchema {
  @Prop()
  FileName: string;

  @Prop()
  FileLocation: string;

  @Prop()
  FileSize: number;

}

export const FileSchema = SchemaFactory.createForClass(FileInfo);
