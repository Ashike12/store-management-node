import { InventoryService } from './inventory.service';

describe('InventoryService per-unit QR tokens', () => {
  const admin = { Roles: ['admin'] } as any;
  const chain = (rows: any[]) => {
    const q: any = {
      select: () => q,
      sort: () => q,
      skip: () => q,
      limit: () => q,
      lean: () => Promise.resolve(rows),
    };
    return q;
  };
  const make = (first: any[], second: any[] = first) => {
    const items = {
      find: jest.fn().mockReturnValueOnce(chain(first)).mockReturnValueOnce(chain(second)),
      bulkWrite: jest.fn().mockResolvedValue({}),
      countDocuments: jest.fn().mockResolvedValue(first.length),
    };
    return { items, service: new InventoryService({} as any, items as any, {} as any) };
  };
  const dto = { BatchId: 'b1', Page: 1, Size: 200 } as any;

  it('returns existing tokens without writing', async () => {
    const { items, service } = make([{ _id: 'u1', UnitIndex: 1, QrToken: 't1' }]);
    const res = await service.listBatchQrTokens(dto, admin);
    expect(res.Data).toEqual([{ UnitIndex: 1, Token: 't1' }]);
    expect(items.bulkWrite).not.toHaveBeenCalled();
  });
  it('lazily and conditionally assigns tokens to units created before QR tokens existed', async () => {
    const { items, service } = make(
      [{ _id: 'u1', UnitIndex: 1 }],
      [{ _id: 'u1', UnitIndex: 1, QrToken: 'new' }],
    );
    const res = await service.listBatchQrTokens(dto, admin);
    const ops = items.bulkWrite.mock.calls[0][0];
    expect(ops).toHaveLength(1);
    expect(ops[0].updateOne.filter).toEqual({ _id: 'u1', QrToken: { $exists: false } });
    expect(ops[0].updateOne.update.$set.QrToken).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(res.Data).toEqual([{ UnitIndex: 1, Token: 'new' }]);
  });
  it('requires an admin and never exposes serial numbers', async () => {
    const { service } = make([]);
    await expect(service.listBatchQrTokens(dto, { Roles: ['wholesaler'] } as any)).rejects.toThrow('Admin access required');
  });
});
