import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  // app.enableCors({
  //   allowedHeaders: ['content-type'],
  //   origin: 'http://storeManagertrust.com:4200',
  //   credentials: true,
  // });

  app.useGlobalPipes(new ValidationPipe());


  // await app.listen(3000); // dev
  await app.listen(4000); // prod
}
bootstrap();

// async function bootstrap() {
//   const app = await NestFactory.create(AppModule);
//   app.enableCors();
//   const configService = app.get(ConfigService);
//   const port = configService.get('WEBSERVER_PORT');
//   await app.listen(port);
// }
// bootstrap();
