import {
  Controller,
  Get,
  INestApplication,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PassportModule, AuthGuard } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import request = require('supertest');
import { JwtStrategy } from './jwt.strategy';

// Test-only route: never imported by an application module or seeded in production.
@Controller('test-private')
class ProtectedProbe {
  @Get()
  @UseGuards(AuthGuard('jwt'))
  get(@Req() req) {
    return { UserId: req.user._id };
  }
}

describe('Real Passport JWT HTTP verification with mocked models', () => {
  let app: INestApplication;
  const secret = 'isolated-jwt-test-secret';
  const original = process.env.JWT_SECRET;
  const jwt = new JwtService({ secret });
  const users = { findOne: jest.fn() };
  const permissions = { countDocuments: jest.fn() };
  beforeAll(async () => {
    process.env.JWT_SECRET = secret;
    const module = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
      controllers: [ProtectedProbe],
      providers: [
        JwtStrategy,
        { provide: getModelToken('User'), useValue: users },
        { provide: getModelToken('FeatureEndpointMap'), useValue: permissions },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  beforeEach(() => {
    users.findOne.mockReset().mockResolvedValue({ _id: 'user-1' });
    permissions.countDocuments.mockReset().mockResolvedValue(1);
  });
  afterAll(async () => {
    await app?.close();
    if (original === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = original;
  });
  const claims = { UserId: 'user-1', Roles: ['admin'] };
  const send = (token: string) =>
    request(app.getHttpServer())
      .get('/test-private')
      .set('Authorization', `Bearer ${token}`);
  it('accepts a valid signed token and checks database permission', async () => {
    const result = await send(jwt.sign(claims, { expiresIn: 60 })).expect(200);
    expect(result.body).toEqual({ UserId: 'user-1' });
    expect(permissions.countDocuments).toHaveBeenCalledTimes(1);
  });
  it.each(['malformed', 'wrong-signature', 'expired'])(
    'rejects %s before model lookup',
    async (type) => {
      const token =
        type === 'malformed'
          ? 'not-a-jwt'
          : type === 'expired'
            ? jwt.sign(claims, { expiresIn: -60 })
            : jwt.sign(claims, { secret: 'wrong-key' });
      await send(token).expect(401);
      expect(users.findOne).not.toHaveBeenCalled();
    },
  );
  it('rejects a missing bearer token', async () => {
    await request(app.getHttpServer()).get('/test-private').expect(401);
    expect(users.findOne).not.toHaveBeenCalled();
  });
  it('rejects a valid token lacking endpoint permission', async () => {
    permissions.countDocuments.mockResolvedValue(0);
    await send(jwt.sign(claims)).expect(403);
  });
  it('rejects a valid token for a deleted account', async () => {
    users.findOne.mockResolvedValue(null);
    await send(jwt.sign(claims)).expect(401);
  });
  it('blocks employee tokens from non-workspace routes even when a role mapping exists', async () => {
    users.findOne.mockResolvedValue({
      _id: 'employee-1',
      Roles: ['appuser', 'employee'],
    });
    await send(
      jwt.sign({UserId: 'employee-1', Roles: ['appuser', 'employee']}),
    ).expect(403);
  });
});
