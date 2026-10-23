import { StorageService } from './storage.service';

describe('StorageService with mocked file metadata', () => {
  const model = {
    create: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
    deleteOne: jest.fn(),
  };
  const query = { limit: jest.fn(), skip: jest.fn() };
  let service: StorageService;
  beforeEach(() => {
    for (const fn of Object.values(model)) fn.mockReset();
    query.limit.mockReset().mockReturnValue(query);
    query.skip
      .mockReset()
      .mockResolvedValue([
        {
          _id: 'file-1',
          FileName: 'test.txt',
          FileSize: 3,
          FileLocation: 'private-path',
        },
      ]);
    model.find.mockReturnValue(query);
    model.countDocuments.mockResolvedValue(1);
    service = new StorageService(model as any);
  });
  it('requires an uploaded file', async () => {
    await expect(
      service.UploadFile(undefined, { _id: 'admin' }, 'customer'),
    ).rejects.toMatchObject({ status: 400 });
    expect(model.create).not.toHaveBeenCalled();
  });
  it('stores upload metadata and access IDs', async () => {
    const response = await service.UploadFile(
      {
        FileId: 'file-1',
        filename: 'test.txt',
        FileLocation: 'test-directory',
        size: 3,
      } as any,
      { _id: 'admin' },
      'customer',
    );
    expect(response.Data).toEqual({ FileId: 'file-1' });
    expect(model.create).toHaveBeenCalledWith(
      expect.objectContaining({
        IdsAllowedToRead: ['admin', 'customer'],
        RolesAllowedToDelete: ['admin'],
      }),
    );
  });
  it('looks up file metadata by ID', async () => {
    model.findOne.mockResolvedValue({ _id: 'file-1' });
    expect(await service.GetFileInfo('file-1')).toEqual({ _id: 'file-1' });
    expect(model.findOne).toHaveBeenCalledWith({ _id: 'file-1' });
  });
  it('scopes customer listings and omits disk paths', async () => {
    const response = await service.getAllDocs(
      { size: '10', page: '2' },
      { _id: 'customer', Roles: ['customer'] },
    );
    expect(model.find).toHaveBeenCalledWith({ IdsAllowedToRead: 'customer' });
    expect(query.skip).toHaveBeenCalledWith(10);
    expect(response.Data).toEqual([
      { ItemId: 'file-1', FileName: 'test.txt', FileSize: 3 },
    ]);
    expect(response.TotalCount).toBe(1);
  });
  it('lists all documents for admin', async () => {
    await service.getAllDocs({ size: '10' }, { Roles: ['admin'] });
    expect(model.find).toHaveBeenCalledWith({});
  });
  it.each(['customer', ''])('filters requested user ID %s', async (id) => {
    await service.getAllDocsByUser({ size: '10', page: '1' }, id);
    expect(model.find).toHaveBeenCalledWith({ IdsAllowedToRead: id });
    expect(model.countDocuments).toHaveBeenCalledWith({ IdsAllowedToRead: id });
  });
  it.each(['file-1', ''])(
    'deletes only the requested metadata ID %s',
    async (id) => {
      await expect(service.DeleteDocument(id)).resolves.toBe(true);
      expect(model.deleteOne).toHaveBeenCalledWith({ _id: id });
    },
  );
});
