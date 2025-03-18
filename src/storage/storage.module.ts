import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';
import { FileSchema } from 'src/shared/schemas/File.schema';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([{ name: 'FileInfo', schema: FileSchema }]),
  ],
  controllers: [StorageController],
  providers: [StorageService],
})
export class StorageModule {}
