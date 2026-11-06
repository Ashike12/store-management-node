import { GoogleIdentityService } from './google-identity.service';

const verifyIdToken = jest.fn();
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: (...args: unknown[]) => verifyIdToken(...args),
  })),
}));

describe('GoogleIdentityService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyIdToken.mockReset();
  });

  it('verifies the token audience and normalizes the Google profile', async () => {
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: 'google-subject',
        email: 'CUSTOMER@EXAMPLE.COM',
        email_verified: true,
        given_name: 'Test',
        family_name: 'Customer',
        name: 'Test Customer',
      }),
    });
    const service = new GoogleIdentityService({
      get: () => 'google-client-id',
    } as any);

    await expect(service.verifyCredential('id-token')).resolves.toEqual({
      subject: 'google-subject',
      email: 'customer@example.com',
      firstName: 'Test',
      lastName: 'Customer',
      displayName: 'Test Customer',
    });
    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: 'id-token',
      audience: 'google-client-id',
    });
  });

  it('rejects unverified Google email addresses', async () => {
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: 'google-subject',
        email: 'customer@example.com',
        email_verified: false,
      }),
    });
    const service = new GoogleIdentityService({
      get: () => 'google-client-id',
    } as any);

    await expect(service.verifyCredential('id-token')).rejects.toMatchObject({
      status: 401,
    });
  });

  it('reports missing server configuration', async () => {
    const service = new GoogleIdentityService({ get: () => '' } as any);

    await expect(service.verifyCredential('id-token')).rejects.toMatchObject({
      status: 503,
    });
    expect(verifyIdToken).not.toHaveBeenCalled();
  });
});
