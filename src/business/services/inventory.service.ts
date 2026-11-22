import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes, randomUUID } from 'crypto';
import { ClientSession, Model } from 'mongoose';
import { UserRoles } from '../../shared/constant/roles.constant';
import { InventoryBatch } from '../../shared/schemas/inventory-batch.schema';
import { InventoryItem } from '../../shared/schemas/inventory-item.schema';
import { User } from '../../shared/schemas/user.schema';
import {
  ListBatchItemsDto,
  ListBatchQrCodesDto,
  ListProductBatchesDto,
} from '../dto/product/inventory.dto';

const newQrToken = () => randomBytes(24).toString('base64url');

@Injectable()
export class InventoryService {
  constructor(
    @InjectModel(InventoryBatch.name)
    private readonly batches: Model<InventoryBatch>,
    @InjectModel(InventoryItem.name)
    private readonly items: Model<InventoryItem>,
    @InjectModel(User.name)
    private readonly users: Model<User>,
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
    MadeByEmployeeId?: string,
  ) {
    let maker: User | null = null;
    if (MadeByEmployeeId) {
      maker = await this.users.findOne({
        _id: MadeByEmployeeId,
        Roles: UserRoles.Employee,
        Active: true,
      });
      if (!maker) {
        throw new ForbiddenException('Selected maker is not an active employee');
      }
    }
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
          MadeByEmployeeId: maker ? String(maker._id) : undefined,
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
        QrToken: newQrToken(),
        CreatedDate,
        RolesAllowedToRead: [UserRoles.Admin],
      };
    });
    await this.items.insertMany(records, { session, ordered: true });
    return {
      BatchId,
      ProductId,
      QuantityReceived,
      MadeByEmployeeId: maker ? String(maker._id) : null,
      MakerName: maker?.DisplayName ||
        [maker?.FirstName, maker?.LastName].filter(Boolean).join(' ') || null,
      CreatedDate,
    };
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
      .select('BatchId ProductId QuantityReceived CreatedBy MadeByEmployeeId CreatedDate')
      .sort({ CreatedDate: -1, BatchId: -1 })
      .skip((dto.Page - 1) * dto.Size)
      .limit(dto.Size)
      .lean();
    const makerIds = [...new Set(Data.map((item: any) => item.MadeByEmployeeId).filter(Boolean))];
    const makers = makerIds.length
      ? await this.users.find({ _id: { $in: makerIds } }).select('_id DisplayName FirstName LastName').lean()
      : [];
    const makerNames = new Map(makers.map((maker: any) => [
      String(maker._id),
      maker.DisplayName || [maker.FirstName, maker.LastName].filter(Boolean).join(' '),
    ]));
    return {
      IsSuccess: true,
      Data: Data.map((item: any) => ({
        ...item,
        MakerName: item.MadeByEmployeeId
          ? makerNames.get(String(item.MadeByEmployeeId)) || 'Former employee'
          : null,
      })),
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

  findBatch(BatchId: string) {
    return this.batches.findOne({ BatchId }).select('BatchId ProductId').lean();
  }

  /** Public lookup: resolves an item QR token to its catalog product id only. */
  async findProductIdByItemQrToken(token: string): Promise<string | null> {
    const item = await this.items
      .findOne({ QrToken: token })
      .select('ProductId')
      .lean();
    return item ? String((item as any).ProductId) : null;
  }

  /**
   * Admin only. One page of per-unit QR tokens for a batch. Units created
   * before QR tokens existed are given one here (conditional, race-safe).
   * Serial numbers are never returned.
   */
  async listBatchQrTokens(dto: ListBatchQrCodesDto, user: User) {
    this.ensureAdmin(user);
    const filter = { BatchId: dto.BatchId };
    const find = () =>
      this.items
        .find(filter)
        .select('_id UnitIndex QrToken')
        .sort({ UnitIndex: 1 })
        .skip((dto.Page - 1) * dto.Size)
        .limit(dto.Size)
        .lean();

    let rows: any[] = await find();
    const missing = rows.filter((row) => !row.QrToken);
    if (missing.length) {
      await this.items.bulkWrite(
        missing.map((row) => ({
          updateOne: {
            filter: { _id: row._id, QrToken: { $exists: false } },
            update: { $set: { QrToken: newQrToken() } },
          },
        })),
        { ordered: false },
      );
      rows = await find();
    }
    return {
      Data: rows.map((row) => ({
        UnitIndex: row.UnitIndex as number,
        Token: row.QrToken as string,
      })),
      TotalCount: await this.items.countDocuments(filter),
    };
  }
}
