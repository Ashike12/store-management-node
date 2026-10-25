import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateClientOrderItemDto } from './create-client-order.dto';

describe('Checkout item DTO bounds', () => {
  const valid = {
    ProductId: 'net',
    ProductName: 'Net',
    Category: 'MosquitoNet',
    SubCategory: 'Double',
    ImageLinks: [],
    UnitPrice: 100,
    Quantity: 1,
  };
  it.each([0, -1, 1.1, 1001, '1', Infinity, NaN])(
    'rejects invalid quantity %s',
    async (Quantity) => {
      const errors = await validate(
        plainToInstance(CreateClientOrderItemDto, { ...valid, Quantity }),
      );
      expect(errors.some((e) => e.property === 'Quantity')).toBe(true);
    },
  );
  it.each([0, -1, 10000001, '100', Infinity, NaN])(
    'rejects invalid price %s',
    async (UnitPrice) => {
      const errors = await validate(
        plainToInstance(CreateClientOrderItemDto, { ...valid, UnitPrice }),
      );
      expect(errors.some((e) => e.property === 'UnitPrice')).toBe(true);
    },
  );
  it.each([1, 1000])('accepts quantity boundary %s', async (Quantity) => {
    expect(
      await validate(
        plainToInstance(CreateClientOrderItemDto, { ...valid, Quantity }),
      ),
    ).toEqual([]);
  });
});
