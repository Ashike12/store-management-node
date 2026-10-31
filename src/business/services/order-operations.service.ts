import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order } from '../../shared/schemas/order.schema';
import { Product } from '../../shared/schemas/product.schema';
import { User } from '../../shared/schemas/user.schema';
import {
  ListOrdersDto,
  TransitionOrderDto,
  UpdateOrderInfoDto,
} from '../dto/client-order/order-operations.dto';

const transitions: Record<string, string[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

@Injectable()
export class OrderOperationsService {
  constructor(
    @InjectModel('Order') private readonly orders: Model<Order>,
    @InjectModel('Product') private readonly products: Model<Product>,
  ) {}

  private authorize(user: User) {
    if (!user?.Roles?.includes('admin'))
      throw new ForbiddenException('Admin access required');
  }

  async list(dto: ListOrdersDto, user: User) {
    this.authorize(user);
    if (
      !Number.isInteger(dto.Page) ||
      dto.Page < 1 ||
      dto.Page > 1000000 ||
      !Number.isInteger(dto.Size) ||
      dto.Size < 1 ||
      dto.Size > 100
    )
      throw new BadRequestException('Invalid pagination');
    if (dto.From && dto.To && new Date(dto.From) > new Date(dto.To))
      throw new BadRequestException('Invalid date range');
    const filter: Record<string, unknown> = {};
    if (dto.Status) filter.OrderStatus = dto.Status;
    if (dto.NeedsAction !== undefined)
      filter.RequiresImmediateAction = dto.NeedsAction;
    if (dto.From || dto.To)
      filter.CreatedDate = {
        ...(dto.From ? { $gte: new Date(dto.From).toISOString() } : {}),
        ...(dto.To ? { $lte: new Date(dto.To).toISOString() } : {}),
      };
    if (dto.Search?.trim()) {
      const term = dto.Search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = ['OrderNumber', 'CustomerName', 'PhoneNumber'].map(
        (key) => ({ [key]: { $regex: term, $options: 'i' } }),
      );
    }
    const Data = await this.orders
      .find(filter)
      .select(
        '-CustomerIp -CaptchaHostname -CaptchaVerifiedAt -RequestHash -RequestId',
      )
      .sort({ CreatedDate: -1, _id: -1 })
      .skip((dto.Page - 1) * dto.Size)
      .limit(dto.Size)
      .lean();
    return {
      IsSuccess: true,
      Data,
      TotalCount: await this.orders.countDocuments(filter),
    };
  }

  async detail(id: string, user: User) {
    this.authorize(user);
    const order = await this.orders
      .findById(id)
      .select(
        '-CustomerIp -CaptchaHostname -CaptchaVerifiedAt -RequestHash -RequestId',
      )
      .lean();
    if (!order) throw new NotFoundException('Order not found');
    return { IsSuccess: true, Data: order };
  }

  async transition(dto: TransitionOrderDto, user: User) {
    this.authorize(user);
    const session = await this.orders.db.startSession();
    try {
      await session.withTransaction(async () => {
        const order = await this.orders.findById(dto.ItemId).session(session);
        if (!order) throw new NotFoundException('Order not found');
        // Retrying an already applied transition must never touch inventory twice.
        if (order.OrderStatus === dto.Status) return;
        if (order.Version !== dto.ExpectedVersion)
          throw new ConflictException('Order changed; refresh before updating');
        if (!transitions[order.OrderStatus]?.includes(dto.Status))
          throw new BadRequestException('Invalid order transition');
        const confirming = dto.Status === 'confirmed';
        const restoring = dto.Status === 'cancelled' && order.StockDeducted;
        let movements = order.StockMovements || [];
        if (confirming) {
          const totals = new Map<string, number>();
          for (const item of order.Items) {
            if (!item.InventoryRequirements?.length)
              throw new ConflictException('Order has no inventory snapshot');
            for (const entry of item.InventoryRequirements) {
              if (
                !entry.ProductId ||
                !Number.isFinite(entry.Quantity) ||
                entry.Quantity <= 0
              )
                throw new ConflictException('Invalid inventory snapshot');
              totals.set(
                entry.ProductId,
                (totals.get(entry.ProductId) || 0) + entry.Quantity,
              );
            }
          }
          // Round fabric requirements upward to six decimal yards, once per material.
          movements = [...totals]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([ProductId, Quantity]) => ({
              ProductId,
              Quantity: Math.ceil(Quantity * 1e6) / 1e6,
            }));
        }
        if (confirming || restoring) {
          for (const entry of movements) {
            const changed = await this.products.updateOne(
              {
                _id: entry.ProductId,
                ...(confirming ? { Quantity: { $gte: entry.Quantity } } : {}),
              },
              {
                $inc: {
                  Quantity: confirming ? -entry.Quantity : entry.Quantity,
                },
              },
              { session },
            );
            if (changed.matchedCount !== 1)
              throw new ConflictException(
                'Insufficient stock or missing material: ' + entry.ProductId,
              );
          }
        }
        const changed = await this.orders.updateOne(
          {
            _id: dto.ItemId,
            Version: dto.ExpectedVersion,
            OrderStatus: order.OrderStatus,
          },
          {
            $set: {
              OrderStatus: dto.Status,
              RequiresImmediateAction: false,
              StockDeducted: confirming
                ? true
                : restoring
                  ? false
                  : order.StockDeducted,
              StockMovements: movements,
            },
            $inc: { Version: 1 },
            $push: {
              AuditHistory: {
                From: order.OrderStatus,
                To: dto.Status,
                By: user._id,
                At: new Date().toISOString(),
                Note: dto.Note?.trim() || '',
              },
            },
          },
          { session },
        );
        if (changed.matchedCount !== 1)
          throw new ConflictException('Order changed; refresh before updating');
      });
    } finally {
      await session.endSession();
    }
    return this.detail(dto.ItemId, user);
  }

  async updateInfo(dto: UpdateOrderInfoDto, user: User) {
    this.authorize(user);
    const order = await this.orders.findById(dto.ItemId).lean();
    if (!order) throw new NotFoundException('Order not found');
    if (order.Version !== dto.ExpectedVersion)
      throw new ConflictException('Order changed; refresh before updating');

    const deliveryZone = dto.DeliveryZone;
    const next = {
      CustomerName: dto.CustomerName.trim(),
      PhoneNumber: dto.PhoneNumber,
      Division: deliveryZone === 'inside_dhaka' ? 'Dhaka' : dto.Division.trim(),
      District: deliveryZone === 'inside_dhaka' ? 'Dhaka' : dto.District.trim(),
      Area: dto.Area.trim(),
      PostCode: dto.PostCode.trim(),
      Address: dto.Address.trim(),
      DeliveryNotes: dto.DeliveryNotes?.trim() || '',
      DeliveryZone: deliveryZone,
      ShippingCost: deliveryZone === 'inside_dhaka' ? 80 : 150,
    };
    const changedFields = Object.keys(next).filter(
      (key) => String(order[key] ?? '') !== String(next[key]),
    );
    if (!changedFields.length)
      throw new BadRequestException('No order information was changed');

    const totalAmount =
      Number(order.Subtotal || 0) -
      Number(order.CouponDiscount || 0) +
      next.ShippingCost;
    if (Number(order.TotalAmount) !== totalAmount)
      changedFields.push('TotalAmount');

    const changed = await this.orders.updateOne(
      { _id: dto.ItemId, Version: dto.ExpectedVersion },
      {
        $set: { ...next, TotalAmount: totalAmount },
        $inc: { Version: 1 },
        $push: {
          AuditHistory: {
            From: order.OrderStatus,
            To: order.OrderStatus,
            By: user._id,
            At: new Date().toISOString(),
            Note: dto.Note?.trim() || '',
            EventType: 'order_info_updated',
            UpdateDoneBy: dto.UpdateDoneBy,
            ChangedFields: [...new Set(changedFields)],
          },
        },
      },
    );
    if (changed.matchedCount !== 1)
      throw new ConflictException('Order changed; refresh before updating');
    return this.detail(dto.ItemId, user);
  }
}
