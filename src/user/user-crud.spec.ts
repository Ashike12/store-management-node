import { UserService } from './user.service';
import * as bcrypt from 'bcryptjs';
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('test-hash'),
}));

describe('User CRUD persistence contracts', () => {
  const model = {
    find: jest.fn(),
    findById: jest.fn(),
    findOne: jest.fn(),
    countDocuments: jest.fn(),
    create: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  };
  const redis = { setWithExpiryInSecond: jest.fn() };
  const query = { limit: jest.fn(), skip: jest.fn() };
  const admin = { _id: 'admin', Roles: ['admin'] } as any;
  const person = {
    _id: 'user-1',
    FirstName: 'Test',
    LastName: 'User',
    Email: 'test@example.com',
    Phone: '01700000000',
    Password: 'secret-hash',
    ActivationId: 'secret-token',
  };
  let service: UserService;
  beforeEach(() => {
    jest.clearAllMocks();
    model.find.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    query.skip.mockResolvedValue([person]);
    model.findById.mockResolvedValue(person);
    model.findOne.mockResolvedValue(person);
    model.countDocuments.mockResolvedValue(0);
    service = new UserService(
      model as any,
      {
        getUid: () => 'generated',
        getFutureUtcDate: () => new Date('2026-11-02T00:00:00Z'),
      } as any,
      redis as any,
    );
  });
  it('lists wholesalers with pagination without returning secrets', async () => {
    model.countDocuments.mockResolvedValue(1);
    const result = await service.findAll({ size: '10', page: '2' }, admin);
    expect(model.find).toHaveBeenCalledWith({ Roles: 'wholesaler' });
    expect(query.limit).toHaveBeenCalledWith(10);
    expect(query.skip).toHaveBeenCalledWith(10);
    expect(result.TotalCount).toBe(1);
    expect(result.Data[0]).not.toHaveProperty('Password');
    expect(result.Data[0]).not.toHaveProperty('ActivationId');
  });
  it.each(['id', 'email', 'self'])(
    'reads %s without exposing password or activation token',
    async (mode) => {
      const result =
        mode === 'id'
          ? await service.findById('user-1')
          : mode === 'email'
            ? await service.findByEmail(person.Email, admin)
            : await service.getCurrentUser({ _id: 'user-1' } as any);
      expect(result.Data.ItemId).toBe('user-1');
      expect(result.Data).not.toHaveProperty('Password');
      expect(result.Data).not.toHaveProperty('ActivationId');
    },
  );
  it.each(['id', 'email', 'self'])(
    'returns 404 for missing %s',
    async (mode) => {
      model.findById.mockResolvedValue(null);
      model.findOne.mockResolvedValue(null);
      const call =
        mode === 'id'
          ? service.findById('missing')
          : mode === 'email'
            ? service.findByEmail(person.Email, admin)
            : service.getCurrentUser(admin);
      await expect(call).rejects.toMatchObject({ status: 404 });
    },
  );
  it.each(['', 'Custom Name'])(
    'creates a wholesaler with display-name value %s',
    async (DisplayName) => {
      await service.createCustomer(
        { ...person, Password: 'plain-password', DisplayName } as any,
        admin,
      );
      expect(bcrypt.hash).toHaveBeenCalledWith('plain-password', 10);
      expect(model.create).toHaveBeenCalledWith(
        expect.objectContaining({
          DisplayName: DisplayName || 'Test User',
          Password: 'test-hash',
          Active: false,
          Roles: ['appuser', 'annonymous', 'wholesaler'],
        }),
      );
      expect(redis.setWithExpiryInSecond).toHaveBeenCalledWith(
        'generated',
        'generated',
        864000,
      );
    },
  );
  it('rejects duplicate email without persisting or issuing activation', async () => {
    model.countDocuments.mockResolvedValue(1);
    await expect(
      service.createCustomer(person as any, admin),
    ).rejects.toMatchObject({ status: 409 });
    expect(model.create).not.toHaveBeenCalled();
    expect(redis.setWithExpiryInSecond).not.toHaveBeenCalled();
  });
  it('hashes admin-set passwords and allowlists editable fields', async () => {
    const dto = {
      ItemId: 'user-1',
      FirstName: 'New',
      LastName: 'Name',
      DisplayName: 'New Name',
      Email: person.Email,
      Phone: person.Phone,
      Address: 'Dhaka',
      Active: false,
      DateOfBirth: new Date('2000-01-01'),
      Password: 'new-password',
      Roles: ['admin'],
    };
    await service.updateById(dto as any, admin);
    const update = model.findByIdAndUpdate.mock.calls[0][1];
    expect(update).toEqual({
      FirstName: 'New',
      LastName: 'Name',
      DisplayName: 'New Name',
      Email: person.Email,
      Phone: person.Phone,
      Address: 'Dhaka',
      Active: false,
      DateOfBirth: dto.DateOfBirth,
      Password: 'test-hash',
    });
  });
  it('allows clearing self-service profile fields', async () => {
    const dto = {
      FirstName: '',
      LastName: '',
      DisplayName: '',
      Phone: '',
      Address: '',
      DateOfBirth: new Date('2000-01-01'),
    };
    await service.updateCurrentUser(dto, admin);
    expect(model.findByIdAndUpdate).toHaveBeenCalledWith('admin', dto, {
      new: true,
      runValidators: true,
    });
  });
});
