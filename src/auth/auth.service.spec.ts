import { AuthService } from './auth.service';
import * as bcrypt from 'bcryptjs';
jest.mock('bcryptjs', () => ({ compare: jest.fn(), hash: jest.fn() }));

describe('AuthService', () => {
  const users = {
    findOne: jest.fn(),
    exists: jest.fn(),
    countDocuments: jest.fn(),
    create: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  };
  const jwt = { sign: jest.fn() };
  const logs = { create: jest.fn() };
  const redis = {
    get: jest.fn(),
    setWithExpiryInSecond: jest.fn(),
    del: jest.fn(),
  };
  const user = {
    _id: 'user-1',
    DisplayName: 'Test User',
    Email: 'test@example.com',
    Password: 'hashed',
    Roles: ['admin'],
    Active: true,
  };
  let service: AuthService;
  beforeEach(() => {
    jest.resetAllMocks();
    users.findOne.mockResolvedValue(user);
    users.exists.mockResolvedValue(null);
    users.countDocuments.mockResolvedValue(0);
    jwt.sign.mockReturnValue('signed-test-token');
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');
    service = new AuthService(
      users as any,
      jwt as any,
      logs as any,
      { getUid: () => 'test-uid' } as any,
      redis as any,
    );
  });
  it('issues tokens and stores refresh metadata without the password', async () => {
    await expect(
      service.login({
        Email: user.Email,
        Password: 'plain',
        GrantType: 'password',
      }),
    ).resolves.toEqual({
      login_token: 'signed-test-token',
      refresh_token: 'test-uid',
    });
    const claims = {
      UserId: 'user-1',
      UserName: 'Test User',
      Roles: ['admin'],
    };
    expect(jwt.sign).toHaveBeenCalledWith(claims);
    expect(redis.setWithExpiryInSecond).toHaveBeenCalledWith(
      'test-uid',
      JSON.stringify(claims),
      5000,
    );
    expect(logs.create).toHaveBeenCalledWith(
      expect.objectContaining({ UserId: 'user-1' }),
    );
  });
  it.each(['unknown', 'wrong-password', 'inactive'])(
    'rejects %s login without issuing tokens',
    async (reason) => {
      if (reason === 'unknown') users.findOne.mockResolvedValue(null);
      if (reason === 'wrong-password')
        (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      if (reason === 'inactive')
        users.findOne.mockResolvedValue({
          ...user,
          Roles: ['customer'],
          Active: false,
        });
      await expect(
        service.login({
          Email: user.Email,
          Password: 'plain',
          GrantType: 'password',
        }),
      ).rejects.toMatchObject({ status: 401 });
      expect(jwt.sign).not.toHaveBeenCalled();
    },
  );
  it('refreshes a stored token', async () => {
    redis.get.mockResolvedValue(
      JSON.stringify({ UserId: 'user-1', Roles: ['admin'] }),
    );
    await expect(service.refresh({ RefreshToken: 'refresh' })).resolves.toEqual(
      { login_token: 'signed-test-token' },
    );
    expect(redis.get).toHaveBeenCalledWith('refresh');
  });
  it('rejects expired refresh tokens', async () => {
    redis.get.mockResolvedValue(null);
    await expect(
      service.refresh({ RefreshToken: 'expired' }),
    ).rejects.toMatchObject({ status: 401 });
    expect(jwt.sign).not.toHaveBeenCalled();
  });
  it('hashes activation passwords and consumes the activation token', async () => {
    redis.get.mockResolvedValue('user-1');
    await service.setPassword({
      ActivationId: 'activation',
      Password: 'new-password',
    });
    expect(users.findByIdAndUpdate).toHaveBeenCalledWith(
      'user-1',
      { Password: 'new-hash' },
      { new: true, runValidators: true },
    );
    expect(redis.del).toHaveBeenCalledWith('activation');
  });
  it('rejects an invalid activation token without modifying the user', async () => {
    redis.get.mockResolvedValue(null);
    await expect(
      service.setPassword({ ActivationId: 'bad', Password: 'new-password' }),
    ).rejects.toMatchObject({ status: 401 });
    expect(users.findByIdAndUpdate).not.toHaveBeenCalled();
  });
  it('rejects duplicate signup email', async () => {
    users.countDocuments.mockResolvedValue(1);
    await expect(
      service.signUp({ Email: user.Email, Password: 'plain' } as any),
    ).rejects.toMatchObject({ status: 409 });
    expect(users.create).not.toHaveBeenCalled();
  });
  it('creates a customer client account and returns login tokens', async () => {
    users.findOne.mockResolvedValue({
      ...user,
      DisplayName: 'Test Customer',
      Roles: ['customer', 'appuser'],
    });
    await expect(
      service.clientSignUp({
        FirstName: ' Test ',
        LastName: ' Customer ',
        Email: 'CUSTOMER@EXAMPLE.COM',
        Password: 'password-123',
      }),
    ).resolves.toEqual({
      login_token: 'signed-test-token',
      refresh_token: 'test-uid',
    });
    expect(users.create).toHaveBeenCalledWith(
      expect.objectContaining({
        Email: 'customer@example.com',
        DisplayName: 'Test Customer',
        Roles: ['customer', 'appuser'],
        Active: true,
      }),
    );
  });
});
