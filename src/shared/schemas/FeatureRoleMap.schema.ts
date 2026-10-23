import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ collection: 'featurerolemaps' })
export class FeatureRoleMap {
  @Prop() _id: string;
  @Prop() FeatureId: string;
  @Prop() FeatureName: string;
  @Prop() RoleName: string;
}

export const FeatureRoleMapSchema =
  SchemaFactory.createForClass(FeatureRoleMap);
