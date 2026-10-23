import { buildMongoUri } from './build-mongo-uri';

describe('Mongo URI configuration (synthetic credentials only)', () => {
  const build = (values: Record<string, string>) =>
    buildMongoUri({ get: (key) => values[key] } as any);
  it('prefers an explicit URI', () => {
    expect(build({ DB_URI: ' mongodb://localhost/test ' })).toBe(
      'mongodb://localhost/test',
    );
  });
  it('encodes credentials and retains non-SRV hosts and query options', () => {
    expect(
      build({
        DB_PROTOCOL: 'mongodb',
        DB_HOSTS: 'localhost:27017',
        DB_USER: 'test@user',
        DB_PASSWORD: 'p:/@',
        DB_NAME: 'test',
        DB_QUERY: '?authSource=admin',
      }),
    ).toBe(
      'mongodb://test%40user:p%3A%2F%40@localhost:27017/test?authSource=admin',
    );
  });
  it('defaults to SRV and supports DB_HOST alias', () => {
    expect(build({ DB_HOST: 'example.test', DB_NAME: 'test' })).toBe(
      'mongodb+srv://example.test/test',
    );
  });
  it('supports omitted database, query, and password', () => {
    expect(build({ DB_HOSTS: 'example.test', DB_USER: 'user' })).toBe(
      'mongodb+srv://user:@example.test/',
    );
  });
  it('rejects missing hosts without echoing secrets', () => {
    expect(() => build({ DB_PASSWORD: 'test-secret' })).toThrow(
      'Mongo configuration missing',
    );
  });
});
