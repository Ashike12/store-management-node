import { OrderOperationsService } from './order-operations.service';

describe('OrderOperationsService order information updates', () => {
  const baseOrder = {
    _id: 'order-1',
    Version: 2,
    OrderStatus: 'pending',
    CustomerName: 'Old Name',
    PhoneNumber: '01700000000',
    Division: 'Chattogram',
    District: 'Cumilla',
    Area: 'Town',
    PostCode: '3500',
    Address: 'Old address',
    DeliveryNotes: '',
    DeliveryZone: 'outside_dhaka',
    ShippingCost: 150,
    Subtotal: 1000,
    CouponDiscount: 100,
    TotalAmount: 1050,
  };
  const orders = {
    findById: jest.fn(),
    updateOne: jest.fn(),
  };
  const products = { updateOne: jest.fn() };
  const admin = { _id: 'admin-1', Roles: ['admin'] } as any;
  let service: OrderOperationsService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new OrderOperationsService(orders as any, products as any);
  });

  const dto = {
    ItemId: 'order-1',
    ExpectedVersion: 2,
    CustomerName: 'Updated Name',
    PhoneNumber: '01800000000',
    Division: 'Ignored',
    District: 'Ignored',
    Area: 'Savar',
    PostCode: '1340',
    Address: 'New address',
    DeliveryNotes: 'Call first',
    DeliveryZone: 'inside_dhaka',
    UpdateDoneBy: 'PhoneCall' as const,
    Note: 'Customer confirmed the address.',
  };

  it('updates delivery details, recalculates totals, and appends an audit event', async () => {
    const updated = { ...baseOrder, ...dto, Version: 3, TotalAmount: 980 };
    orders.findById
      .mockReturnValueOnce({ lean: jest.fn().mockResolvedValue(baseOrder) })
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(updated),
        }),
      });
    orders.updateOne.mockResolvedValue({ matchedCount: 1 });

    await expect(service.updateInfo(dto, admin)).resolves.toEqual({
      IsSuccess: true,
      Data: updated,
    });

    expect(orders.updateOne).toHaveBeenCalledWith(
      { _id: 'order-1', Version: 2 },
      expect.objectContaining({
        $set: expect.objectContaining({
          Division: 'Dhaka',
          District: 'Dhaka',
          ShippingCost: 80,
          TotalAmount: 980,
        }),
        $inc: { Version: 1 },
        $push: {
          AuditHistory: expect.objectContaining({
            EventType: 'order_info_updated',
            UpdateDoneBy: 'PhoneCall',
            By: 'admin-1',
            ChangedFields: expect.arrayContaining([
              'CustomerName',
              'PhoneNumber',
              'DeliveryZone',
              'ShippingCost',
              'TotalAmount',
            ]),
          }),
        },
      }),
    );
  });

  it('rejects stale updates before writing', async () => {
    orders.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ ...baseOrder, Version: 3 }),
    });

    await expect(service.updateInfo(dto, admin)).rejects.toMatchObject({
      status: 409,
    });
    expect(orders.updateOne).not.toHaveBeenCalled();
  });

  it('rejects requests that do not change order information', async () => {
    const unchanged = {
      ItemId: 'order-1',
      ExpectedVersion: 2,
      CustomerName: baseOrder.CustomerName,
      PhoneNumber: baseOrder.PhoneNumber,
      Division: baseOrder.Division,
      District: baseOrder.District,
      Area: baseOrder.Area,
      PostCode: baseOrder.PostCode,
      Address: baseOrder.Address,
      DeliveryNotes: baseOrder.DeliveryNotes,
      DeliveryZone: baseOrder.DeliveryZone,
      UpdateDoneBy: 'Email' as const,
    };
    orders.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue(baseOrder),
    });

    await expect(service.updateInfo(unchanged, admin)).rejects.toMatchObject({
      status: 400,
    });
    expect(orders.updateOne).not.toHaveBeenCalled();
  });
});
