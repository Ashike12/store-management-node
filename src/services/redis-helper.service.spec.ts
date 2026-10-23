import Redis from 'ioredis';
import { RedisHelperService } from './redis-helper.service';
jest.mock('ioredis', () => ({ __esModule: true, default: jest.fn() }));

describe('RedisHelperService command contracts (no connection)', () => {
  const client = {
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    incr: jest.fn(),
    quit: jest.fn(),
  };
  let service: RedisHelperService;
  beforeEach(() => {
    jest.clearAllMocks();
    (Redis as unknown as jest.Mock).mockImplementation(() => client);
    client.set.mockResolvedValue('OK');
    service = new RedisHelperService();
  });
  it('writes ordinary values', async () => {
    await service.set('test', 'value');
    expect(client.set).toHaveBeenCalledWith('test', 'value');
  });
  it('writes expiring values with seconds', async () => {
    await service.setWithExpiryInSecond('test', 'value', 60);
    expect(client.set).toHaveBeenCalledWith('test', 'value', 'EX', 60);
  });
  it('gets and deletes a key', async () => {
    client.get.mockResolvedValue('value');
    client.del.mockResolvedValue(1);
    expect(await service.get('test')).toBe('value');
    expect(await service.del('test')).toBe(1);
  });
  it('creates the rate-limit counter with NX and expiry', async () => {
    expect(await service.incrementWithExpiryInSecond('counter', 60)).toBe(1);
    expect(client.set).toHaveBeenCalledWith('counter', '1', 'EX', 60, 'NX');
    expect(client.incr).not.toHaveBeenCalled();
  });
  it('increments an existing counter without renewing its expiry', async () => {
    client.set.mockResolvedValue(null);
    client.incr.mockResolvedValue(2);
    expect(await service.incrementWithExpiryInSecond('counter', 60)).toBe(2);
    expect(client.incr).toHaveBeenCalledWith('counter');
  });
  it('closes the client on module destruction', () => {
    service.onModuleDestroy();
    expect(client.quit).toHaveBeenCalledTimes(1);
  });
});
