import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { UserSchema } from '../shared/schemas/user.schema';
import { SharedService } from '../services/shared.service';
import { RedisHelperService } from '../services/redis-helper.service';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([{ name: 'User', schema: UserSchema }]),
  ],
  controllers: [UserController],
  providers: [UserService, SharedService, RedisHelperService],
})
export class UserModule {}
