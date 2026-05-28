import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { StorageModule } from './storage/storage.module';
import { BusinessModule } from './business/business.module';
import { buildMongoUri } from './build-mongo-uri';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: '.env',
      isGlobal: true,
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: buildMongoUri(config),
      }),
    }),
    UserModule,
    AuthModule,
    StorageModule,
    BusinessModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
