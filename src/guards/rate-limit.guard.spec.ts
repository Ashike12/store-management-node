import { RateLimitGuard } from './rate-limit.guard';

describe('RateLimitGuard', () => {
  const redis = { incrementWithExpiryInSecond: jest.fn() };
  const context = (
    headers = {},
    ip = '127.0.0.1',
    remoteAddress = '127.0.0.2',
  ) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          headers,
          ip,
          socket: { remoteAddress },
          method: 'POST',
          originalUrl: '/business/GetClientProducts?pageSize=10',
        }),
      }),
    }) as any;
  beforeEach(() =>
    redis.incrementWithExpiryInSecond.mockReset().mockResolvedValue(1),
  );
  const guard = () => new (RateLimitGuard(60, 10) as any)(redis);
  it.each([
    [{}, '127.0.0.1'],
    [{ 'x-forwarded-for': '10.0.0.1, 10.0.0.2' }, '10.0.0.1'],
    [{ 'x-forwarded-for': ['10.0.0.3, 10.0.0.4'] }, '10.0.0.3'],
  ])('uses an IP and query-independent key', async (headers, expected) => {
    await expect(guard().canActivate(context(headers))).resolves.toBe(true);
    expect(redis.incrementWithExpiryInSecond).toHaveBeenCalledWith(
      `rate-limit:POST:/business/GetClientProducts:${expected}`,
      60,
    );
  });
  it('allows the last request at the limit', async () => {
    redis.incrementWithExpiryInSecond.mockResolvedValue(10);
    await expect(guard().canActivate(context())).resolves.toBe(true);
  });
  it('returns 429 above the limit', async () => {
    redis.incrementWithExpiryInSecond.mockResolvedValue(11);
    await expect(guard().canActivate(context())).rejects.toMatchObject({
      status: 429,
    });
  });
  it('does not silently allow requests when Redis fails', async () => {
    redis.incrementWithExpiryInSecond.mockRejectedValue(
      new Error('Redis unavailable'),
    );
    await expect(guard().canActivate(context())).rejects.toThrow(
      'Redis unavailable',
    );
  });
  it('falls back to socket address', async () => {
    await guard().canActivate(context({}, ''));
    expect(redis.incrementWithExpiryInSecond).toHaveBeenCalledWith(
      expect.stringContaining('127.0.0.2'),
      60,
    );
  });
  it('falls back to an unknown IP bucket', async () => {
    await guard().canActivate(context({}, '', ''));
    expect(redis.incrementWithExpiryInSecond).toHaveBeenCalledWith(
      expect.stringContaining('unknown-ip'),
      60,
    );
  });
});
