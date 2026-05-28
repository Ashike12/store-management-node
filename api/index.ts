import type { INestApplication } from '@nestjs/common';
import * as path from 'path';
import * as Module from 'module';

// Vercel runtime does not automatically resolve TypeScript baseUrl aliases like `src/...`.
// Register project root as a module lookup path before loading Nest modules.
const projectRoot = path.resolve(__dirname, '..');
process.env.NODE_PATH = process.env.NODE_PATH
  ? `${process.env.NODE_PATH}${path.delimiter}${projectRoot}`
  : projectRoot;
(Module as any)._initPaths();

let cachedApp: INestApplication | null = null;
let appInitPromise: Promise<INestApplication> | null = null;

async function getApp(): Promise<INestApplication> {
  if (cachedApp) {
    return cachedApp;
  }

  if (!appInitPromise) {
    appInitPromise = (async () => {
      const { createNestApp } = await import('../src/bootstrap-app');
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
