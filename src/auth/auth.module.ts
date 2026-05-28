import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { UserSchema } from '../shared/schemas/user.schema';
import { SharedService } from '../services/shared.service';
import { RedisHelperService } from '../services/redis-helper.service';
import { FeatureEndpointMapSchema } from '../shared/schemas/FeatureEndpointMap.schema';
import { UserLoginLogSchema } from '../shared/schemas/userloginlog.schema';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return {
          secret: config.get<string>('JWT_SECRET'),
          signOptions: {
            expiresIn: config.get<string>('JWT_EXPIRES') as any,
          },
        };
      },
    }),
    MongooseModule.forFeature([
      { name: 'User', schema: UserSchema },
      { name: 'UserLoginLog', schema: UserLoginLogSchema },
      { name: 'FeatureEndpointMap', schema: FeatureEndpointMapSchema }
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, SharedService, RedisHelperService],
  exports: [JwtStrategy, PassportModule],
})
export class AuthModule {}
