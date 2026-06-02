import { createNestApp } from './bootstrap-app';

async function bootstrap() {
  const app = await createNestApp();
  // await app.listen(3000); // dev
  await app.listen(4000); // prod
}
bootstrap();
