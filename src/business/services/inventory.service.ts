import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { ClientSession, Model } from 'mongoose';
import { UserRoles } from '../../shared/constant/roles.constant';
import { InventoryBatch } from '../../shared/schemas/inventory-batch.schema';
import { InventoryItem } from '../../shared/schemas/inventory-item.schema';
import { User } from '../../shared/schemas/user.schema';
import {
  ListBatchItemsDto,
  ListProductBatchesDto,
} from '../dto/product/inventory.dto';

@Injectable()
export class InventoryService {
  constructor(
    @InjectModel(InventoryBatch.name)
    private readonly batches: Model<InventoryBatch>,
    @InjectModel(InventoryItem.name)
    private readonly items: Model<InventoryItem>,
  ) {}

  private ensureAdmin(user?: User) {
    if (!user?.Roles?.includes(UserRoles.Admin)) {
      throw new ForbiddenException('Admin access required');
    }
  }

  async createBatch(
    ProductId: string,
    QuantityReceived: number,
    CreatedBy: string,
    RequestId: string,
    session: ClientSession,
  ) {
    const BatchId = `BAT${randomUUID().replace(/-/g, '').toUpperCase()}`;
    const CreatedDate = new Date().toISOString();
    await this.batches.create(
      [
        {
          _id: BatchId,
          BatchId,
          ProductId,
          QuantityReceived,
          CreatedBy,
          RequestId,
          CreatedDate,
          RolesAllowedToRead: [UserRoles.Admin],
        },
      ],
      { session },
    );

    const records = Array.from({ length: QuantityReceived }, (_, index) => {
      const uniqueId = randomUUID().replace(/-/g, '').toUpperCase();
      return {
        _id: uniqueId,
        SerialNumber: `${BatchId}_${uniqueId}`,
        BatchId,
        ProductId,
        UnitIndex: index + 1,
        CreatedDate,
        RolesAllowedToRead: [UserRoles.Admin],
      };
    });
    await this.items.insertMany(records, { session, ordered: true });
    return { BatchId, ProductId, QuantityReceived, CreatedDate };
  }

  findRequestBatches(RequestId: string) {
    return this.batches.find({ RequestId }).lean();
  }

  async hasBatches(ProductId: string) {
    return (await this.batches.countDocuments({ ProductId })) > 0;
  }

  async listBatches(dto: ListProductBatchesDto, user: User) {
    this.ensureAdmin(user);
    const filter = { ProductId: dto.ProductId };
    const Data = await this.batches
      .find(filter)
      .select('BatchId ProductId QuantityReceived CreatedBy CreatedDate')
      .sort({ CreatedDate: -1, BatchId: -1 })
      .skip((dto.Page - 1) * dto.Size)
      .limit(dto.Size)
      .lean();
    return {
      IsSuccess: true,
      Data,
      TotalCount: await this.batches.countDocuments(filter),
    };
  }

  async listItems(dto: ListBatchItemsDto, user: User) {
    this.ensureAdmin(user);
    const filter = { BatchId: dto.BatchId };
    const Data = await this.items
      .find(filter)
      .select('SerialNumber BatchId ProductId UnitIndex CreatedDate')
      .sort({ UnitIndex: 1 })
      .skip((dto.Page - 1) * dto.Size)
      .limit(dto.Size)
      .lean();
    return {
      IsSuccess: true,
      Data,
      TotalCount: await this.items.countDocuments(filter),
    };
  }
}
