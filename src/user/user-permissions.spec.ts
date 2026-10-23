import { UserService } from './user.service';

describe('Admin user mutation authorization', () => {
  const model = {
    findOne: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findByIdAndDelete: jest.fn(),
  };
  let service: UserService;
  beforeEach(() => {
    jest.clearAllMocks();
    model.findOne.mockResolvedValue({ _id: 'target' });
    service = new UserService(model as any, {} as any, {} as any);
  });
  const operations = ['update', 'delete'] as const;
  const invoke = (operation: string, roles: string[]) =>
    operation === 'update'
      ? service.updateById(
          { ItemId: 'target', DisplayName: 'Updated' } as any,
          { Roles: roles } as any,
        )
      : service.deleteById('target', { Roles: roles } as any);

  describe.each(operations)('%s', (operation) => {
    it.each([['admin'], ['appuser', 'admin'], ['admin', 'wholesaler']])(
      'allows admin regardless of role order: %j',
      async (...roles) => {
        await expect(invoke(operation, roles)).resolves.toBeDefined();
        const write =
          operation === 'update'
            ? model.findByIdAndUpdate
            : model.findByIdAndDelete;
        expect(write).toHaveBeenCalledTimes(1);
      },
    );
    it.each([['wholesaler'], ['customer'], ['appuser'], ['annonymous']])(
      'denies non-admin role: %s',
      async (role) => {
        await expect(invoke(operation, [role])).rejects.toMatchObject({
          status: 401,
        });
        expect(model.findByIdAndUpdate).not.toHaveBeenCalled();
        expect(model.findByIdAndDelete).not.toHaveBeenCalled();
      },
    );
    it('denies an empty role list', async () => {
      await expect(invoke(operation, [])).rejects.toMatchObject({
        status: 401,
      });
      expect(model.findByIdAndUpdate).not.toHaveBeenCalled();
      expect(model.findByIdAndDelete).not.toHaveBeenCalled();
    });
  });
});
