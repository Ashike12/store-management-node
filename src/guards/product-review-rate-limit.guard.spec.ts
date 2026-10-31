import { HttpException } from '@nestjs/common';
import { ProductReviewRateLimitGuard } from './product-review-rate-limit.guard';

describe('ProductReviewRateLimitGuard', () => {
  const increment = jest.fn();
  const guard = new ProductReviewRateLimitGuard({
    incrementWithExpiryInSecond: increment,
  } as any);
  const context = (user?: any) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as any;

  beforeEach(() => {
    jest.resetAllMocks();
    increment.mockResolvedValue(1);
  });

  it('uses authenticated user keys for both rate windows', async () => {
    await expect(
      guard.canActivate(context({ _id: 'customer-1' })),
    ).resolves.toBe(true);
    expect(increment).toHaveBeenNthCalledWith(
      1,
      'rate-limit:product-review:user:customer-1:minute',
      60,
    );
    expect(increment).toHaveBeenNthCalledWith(
      2,
      'rate-limit:product-review:user:customer-1:hour',
      3600,
    );
  });

  it('rejects missing authentication', async () => {
    await expect(guard.canActivate(context())).rejects.toMatchObject({
      status: 401,
    });
    expect(increment).not.toHaveBeenCalled();
  });

  it('rejects users over either rate window', async () => {
    increment.mockResolvedValueOnce(6).mockResolvedValueOnce(10);
    await expect(
      guard.canActivate(context({ _id: 'customer-1' })),
    ).rejects.toBeInstanceOf(HttpException);
  });
});
