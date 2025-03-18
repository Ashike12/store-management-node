import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { RootSchema } from './root.schema';

@Schema({
  timestamps: true,
})
export class FeatureEndpointMap {
  @Prop()
  _id: string;

  @Prop()
  FeatureId: string;

  @Prop()
  FeatureName: string;

  @Prop()
  APIToAccess: string;

  @Prop()
  RoleName: string;

}

export const FeatureEndpointMapSchema = SchemaFactory.createForClass(FeatureEndpointMap);
