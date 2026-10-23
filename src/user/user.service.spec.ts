import { UserService } from './user.service';
import * as bcrypt from 'bcryptjs';
jest.mock('bcryptjs', () => ({ compare: jest.fn(), hash: jest.fn() }));

describe('UserService self-service password/profile', () => {
  const model = { findOne: jest.fn(), findByIdAndUpdate: jest.fn() };
  const user = { _id: 'self', Roles: ['wholesaler'] } as any;
  const dto = { CurrentPassword: 'old-password', NewPassword: 'new-password' };
  let service: UserService;
  beforeEach(() => {
    jest.resetAllMocks();
    model.findOne.mockResolvedValue({ _id: 'self', Password: 'old-hash' });
    (bcrypt.compare as jest.Mock)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');
    service = new UserService(model as any, {} as any, {} as any);
  });
  it('changes only the authenticated user password after checking the old password', async () => {
    await service.changePassword(dto, user);
    expect(model.findOne).toHaveBeenCalledWith({ _id: 'self' });
    expect(bcrypt.compare).toHaveBeenNthCalledWith(
      1,
      'old-password',
      'old-hash',
    );
    expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
      'self',
      { Password: 'new-hash' },
      { new: true, runValidators: true },
    );
  });
  it('rejects a nonexistent user', async () => {
    model.findOne.mockResolvedValue(null);
    await expect(service.changePassword(dto, user)).rejects.toMatchObject({
      status: 400,
    });
    expect(model.findByIdAndUpdate).not.toHaveBeenCalled();
  });
  it('rejects an incorrect current password', async () => {
    (bcrypt.compare as jest.Mock).mockReset().mockResolvedValue(false);
    await expect(service.changePassword(dto, user)).rejects.toMatchObject({
      status: 401,
    });
    expect(model.findByIdAndUpdate).not.toHaveBeenCalled();
  });
  it('rejects reusing the current password', async () => {
    (bcrypt.compare as jest.Mock).mockReset().mockResolvedValue(true);
    await expect(service.changePassword(dto, user)).rejects.toMatchObject({
      status: 400,
    });
    expect(model.findByIdAndUpdate).not.toHaveBeenCalled();
  });
  it('ignores injected roles and IDs in profile updates', async () => {
    await service.updateCurrentUser(
      { DisplayName: 'Updated', ItemId: 'other', Roles: ['admin'] } as any,
      user,
    );
    expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
      'self',
      { DisplayName: 'Updated' },
      { new: true, runValidators: true },
    );
  });
});
