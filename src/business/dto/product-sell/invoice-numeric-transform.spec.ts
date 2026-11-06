import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateInvoiceDto } from './create-invoice.dto';

describe('invoice numeric input transformation', () => {
  it('accepts browser number inputs serialized as strings', async () => {
    const dto = plainToInstance(CreateInvoiceDto, {
      PaymentAmount: '650',
      ProductSellInfo: [
        {
          ProductId: 'product-1',
          Quantity: '1',
          SellingPrice: '650',
        },
      ],
      WholeSalerId: '',
      InvoiceType: 'CONSUMER',
      SoldByUserId: 'admin-1',
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.PaymentAmount).toBe(650);
    expect(dto.ProductSellInfo[0]).toMatchObject({
      Quantity: 1,
      SellingPrice: 650,
    });
  });
});
