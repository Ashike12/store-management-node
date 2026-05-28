import type { INestApplication } from '@nestjs/common';
import { createNestApp } from '../src/bootstrap-app';

let cachedApp: INestApplication | null = null;
let appInitPromise: Promise<INestApplication> | null = null;

async function getApp(): Promise<INestApplication> {
  if (cachedApp) {
    return cachedApp;
  }

  if (!appInitPromise) {
    appInitPromise = (async () => {
      const app = await createNestApp();
      await app.init();
      cachedApp = app;
      return app;
    })();
  }

  return appInitPromise;
}

export default async function handler(req: any, res: any) {
  const app = await getApp();
  const expressApp = app.getHttpAdapter().getInstance();
  return expressApp(req, res);
}
