import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

describe('JWT database permission validation', () => {
  let strategy: JwtStrategy;
  const users = { findOne: jest.fn() };
  const endpoints = { countDocuments: jest.fn() };
  const payload = () => ({
    UserId: 'user-1',
    UserName: 'Test',
    Roles: ['admin'],
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  const req = (url = '/business/GetProducts?pageSize=10') =>
    ({ url }) as Request;
  let oldSecret: string;
  beforeAll(() => {
    oldSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'test-only-not-a-real-secret';
  });
  afterAll(() => {
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  });
  beforeEach(() => {
    users.findOne
      .mockReset()
      .mockResolvedValue({ _id: 'user-1', Roles: ['admin'] });
    endpoints.countDocuments.mockReset().mockResolvedValue(1);
    strategy = new JwtStrategy(users as any, endpoints as any);
  });
  it('queries endpoint permissions for token roles without query parameters', async () => {
    await expect(strategy.validate(req(), payload())).resolves.toEqual({
      _id: 'user-1',
      Roles: ['admin'],
    });
    expect(users.findOne).toHaveBeenCalledWith({ _id: 'user-1' });
    expect(endpoints.countDocuments).toHaveBeenCalledWith({
      RoleName: { $in: ['admin'] },
      APIToAccess: { $regex: /business\/getproducts/i },
    });
  });
  it('rejects a deleted user', async () => {
    users.findOne.mockResolvedValue(null);
    await expect(strategy.validate(req(), payload())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
  it('rejects expired tokens', async () => {
    await expect(
      strategy.validate(req(), { ...payload(), exp: 1 }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('denies endpoints without a permission mapping', async () => {
    endpoints.countDocuments.mockResolvedValue(0);
    await expect(strategy.validate(req(), payload())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
  it.each([
    '/user/me',
    '/user/updateprofile',
    '/user/update-profile',
    '/user/changepassword',
    '/user/change-password',
  ])('characterizes the profile fallback for %s', async (url) => {
    endpoints.countDocuments.mockResolvedValue(0);
    await expect(strategy.validate(req(url), payload())).resolves.toBeDefined();
  });
  it.each(['/business/getinvoice', '/business/getdashboarddata'])(
    'allows the wholesaler read fallback for %s',
    async (url) => {
      endpoints.countDocuments.mockResolvedValue(0);
      await expect(
        strategy.validate(req(url), { ...payload(), Roles: ['wholesaler'] }),
      ).resolves.toBeDefined();
    },
  );
  it('denies an unmapped product write to a wholesaler', async () => {
    endpoints.countDocuments.mockResolvedValue(0);
    await expect(
      strategy.validate(req('/business/createproduct'), {
        ...payload(),
        Roles: ['wholesaler'],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('allows admin AI fallback but denies wholesaler AI fallback', async () => {
    endpoints.countDocuments.mockResolvedValue(0);
    await expect(
      strategy.validate(req('/business/generateaisuggestion'), payload()),
    ).resolves.toBeDefined();
    await expect(
      strategy.validate(req('/business/generateaisuggestion'), {
        ...payload(),
        Roles: ['wholesaler'],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
