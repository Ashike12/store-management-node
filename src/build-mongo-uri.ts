import { ConfigService } from '@nestjs/config';

const trimOptional = (value?: string): string => (value ?? '').trim();

export function buildMongoUri(config: ConfigService): string {
  const existingUri = trimOptional(config.get<string>('DB_URI'));
  if (existingUri) {
    return existingUri;
  }

  const protocol = trimOptional(config.get<string>('DB_PROTOCOL')) || 'mongodb+srv';
  const hosts = trimOptional(config.get<string>('DB_HOSTS')) || trimOptional(config.get<string>('DB_HOST'));
  const dbName = trimOptional(config.get<string>('DB_NAME'));
  const dbUser = trimOptional(config.get<string>('DB_USER'));
  const dbPassword = config.get<string>('DB_PASSWORD') ?? '';
  const queryRaw = trimOptional(config.get<string>('DB_QUERY'));

  if (!hosts) {
    throw new Error('Mongo configuration missing. Set DB_HOSTS (or DB_HOST) and DB_NAME, or provide DB_URI.');
  }

  const authPart = dbUser
    ? `${encodeURIComponent(dbUser)}:${encodeURIComponent(dbPassword)}@`
    : '';
  const databasePart = dbName ? `/${dbName}` : '/';
  const queryPart = queryRaw ? `?${queryRaw.replace(/^\?/, '')}` : '';

  return `${protocol}://${authPart}${hosts}${databasePart}${queryPart}`;
}
