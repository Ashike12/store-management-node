import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import * as mongoose from 'mongoose';
import { UserRoles } from '../../shared/constant/roles.constant';
import { InjectModel } from '@nestjs/mongoose';
import { Query } from 'express-serve-static-core';
import { QueryRespone } from '../../shared/response/query.response';
import { CommandResponse } from '../../shared/response/command.response';
import { SharedService } from '../../services/shared.service';
import { indexOf as _indexOf } from 'lodash';
import { CreateProductDto } from '../dto/product/create-product.dto';
import { Product } from '../../shared/schemas/product.schema';
import { UpdateProductDto } from '../dto/product/update-product.dto';
import { GetProductDto } from '../dto/product/get-product.dto';
import {
  CreateInvoiceDto,
  ProductSellDto,
} from '../dto/product-sell/create-invoice.dto';
import { ProductSell } from '../../shared/schemas/productSell.schema';
import { Invoice } from '../../shared/schemas/invoice.schema';
import { User } from '../../shared/schemas/user.schema';
import { GetInvoiceDto } from '../dto/product-sell/get-invoice.dto';
import { AddProductionDto } from '../dto/product/add-production.dto';
import { PRODUCT_CATEGORY_SUBCATEGORY_MAP } from '../../shared/constant/product.constant';
import { InventoryService } from './inventory.service';
import { createHash } from 'crypto';

@Injectable()
export class ProductService {
  constructor(
    @InjectModel(Product.name)
    private productModel: mongoose.Model<Product>,
    @InjectModel(ProductSell.name)
    private productSellModel: mongoose.Model<ProductSell>,
    @InjectModel(Invoice.name)
    private invoiceModel: mongoose.Model<Invoice>,
    @InjectModel(User.name)
    private userModel: mongoose.Model<User>,
    private sharedService: SharedService,
    private inventoryService: InventoryService,
  ) {}
  async createProduct(
    dto: CreateProductDto,
    user: User,
  ): Promise<CommandResponse> {
    const response = new CommandResponse();
    const requestHash = this.hashCreateProduct(dto);

    const replay = await this.productModel.findOne({
      CreationRequestId: dto.RequestId,
    });
    if (replay) {
      if ((replay as any).CreationRequestHash !== requestHash) {
        throw new ConflictException(
          'RequestId was already used for a different product creation',
        );
      }
      response.setSuccess({ ItemId: replay._id, Replayed: true });
      return response;
    }

    const existingData = await this.productModel.findOne({
      ProductName: dto.ProductName,
      Category: dto.Category,
      SubCategory: dto.SubCategory,
      NetHeight: this.getNetHeightDuplicateQuery(dto.Category, dto.NetHeight),
    });
    if (existingData != null) {
      throw new BadRequestException(
        'Same product already exists: ' + dto.ProductName,
      );
    }
    this.validateCategoryAndSubCategory(dto.Category, dto.SubCategory);

    const dataModel = {
      _id: this.sharedService.getUid(),
      CreationRequestId: dto.RequestId,
      CreationRequestHash: requestHash,
      ProductName: dto.ProductName,
      Category: dto.Category,
      SubCategory: dto.SubCategory,
      NetHeight: dto.NetHeight ?? '',
      NetHeightUnit: 'feet',
      ImageLinks: dto.ImageLinks ?? [],
      VideoLink: dto.VideoLink,
      MakingPrice: dto.MakingPrice,
      WholeSalerPrice: dto.WholeSalerPrice,
      EndUserPrice: dto.EndUserPrice,
      EndUserDiscountedPrice: dto.EndUserDiscountedPrice,
      Quantity: dto.Quantity,
      Description: dto.Description,
      RolesAllowedToRead: [UserRoles.Admin],
      RolesAllowedToUpdate: [UserRoles.Admin],
      RolesAllowedToWrite: [UserRoles.Admin],
      CreatedDate: new Date().toISOString(),
    };
    const session = await this.productModel.db.startSession();
    let batch;
    try {
      await session.withTransaction(async () => {
        await this.productModel.create([dataModel], { session });
        if (dto.Quantity > 0) {
          batch = await this.inventoryService.createBatch(
            dataModel._id,
            dto.Quantity,
            String(user._id),
            dto.RequestId,
            session,
          );
        }
      });
    } catch (error) {
      if ((error as any)?.code === 11000) {
        const existing = await this.productModel.findOne({
          CreationRequestId: dto.RequestId,
        });
        if (existing) {
          if ((existing as any).CreationRequestHash !== requestHash) {
            throw new ConflictException(
              'RequestId was already used for a different product creation',
            );
          }
          response.setSuccess({ ItemId: existing._id, Replayed: true });
          return response;
        }
      }
      throw error;
    } finally {
      await session.endSession();
    }
    response.setSuccess({ ItemId: dataModel._id, Batch: batch ?? null });
    return response;
  }

  private hashCreateProduct(dto: CreateProductDto): string {
    const payload: Record<string, unknown> = { ...dto };
    delete payload.RequestId;
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private createUpdateObject(dto: UpdateProductDto): any {
    const updates = {};
    if (dto.ProductName != null) updates['ProductName'] = dto.ProductName;
    if (dto.Category != null) updates['Category'] = dto.Category;
    if (dto.SubCategory != null) updates['SubCategory'] = dto.SubCategory;
    if (dto.NetHeight != null) updates['NetHeight'] = dto.NetHeight;
    if (dto.ImageLinks != null) updates['ImageLinks'] = dto.ImageLinks;
    if (dto.VideoLink != null) updates['VideoLink'] = dto.VideoLink;
    if (dto.MakingPrice != null) updates['MakingPrice'] = dto.MakingPrice;
    if (dto.WholeSalerPrice != null)
      updates['WholeSalerPrice'] = dto.WholeSalerPrice;
    if (dto.EndUserPrice != null) updates['EndUserPrice'] = dto.EndUserPrice;
    if (dto.EndUserDiscountedPrice != null)
      updates['EndUserDiscountedPrice'] = dto.EndUserDiscountedPrice;
    if (dto.Description != null) updates['Description'] = dto.Description;
    return updates;
  }

  private validateCategoryAndSubCategory(
    category: string,
    subCategory: string,
  ): void {
    const allowedSubCategories = PRODUCT_CATEGORY_SUBCATEGORY_MAP[category];
    if (!allowedSubCategories) {
      throw new BadRequestException('Invalid category: ' + category);
    }

    if (!allowedSubCategories.includes(subCategory)) {
      throw new BadRequestException(
        'Invalid sub category for selected category',
      );
    }
  }

  private shouldUseNetHeight(category: string): boolean {
    return ['MosquitoNet', 'MosquitoNetYard'].includes(category);
  }

  private getNetHeightDuplicateQuery(
    category: string,
    netHeight?: string,
  ): any {
    const normalizedHeight = this.shouldUseNetHeight(category)
      ? (netHeight ?? '')
      : '';

    return normalizedHeight ? normalizedHeight : { $in: ['', null] };
  }

  async updateProduct(dto: UpdateProductDto): Promise<CommandResponse> {
    const response = new CommandResponse();
    const existingData = await this.productModel.findOne({ _id: dto.ItemId });
    // console.log(dto.ItemId);
    if (existingData == null) {
      throw new BadRequestException('No Data found with ItemId: ' + dto.ItemId);
    }

    const nextCategory = dto.Category ?? (existingData as any).Category;
    const nextSubCategory =
      dto.SubCategory ?? (existingData as any).SubCategory;
    if (nextCategory && nextSubCategory) {
      this.validateCategoryAndSubCategory(nextCategory, nextSubCategory);
    }

    if (
      dto.Quantity != null &&
      Number(dto.Quantity) !== Number((existingData as any).Quantity)
    ) {
      throw new BadRequestException(
        'Stock quantity cannot be edited directly; use AddProduction',
      );
    }

    await this.productModel.findByIdAndUpdate(
      dto.ItemId,
      this.createUpdateObject(dto),
      {
        new: true,
        runValidators: true,
      },
    );

    return response;
  }

  async deleteById(id: string): Promise<CommandResponse> {
    const response = new CommandResponse();
    const existingData = await this.productModel.findOne({ _id: id });
    if (!existingData) {
      throw new BadRequestException('Data not found');
    }
    if (await this.inventoryService.hasBatches(id)) {
      throw new ConflictException(
        'Products with inventory history cannot be deleted',
      );
    }

    await this.productModel.findByIdAndDelete(id);
    return response;
  }

  async getProduct(query: Query, dto: GetProductDto): Promise<QueryRespone> {
    const response = new QueryRespone();
    const { datas, dataCount } = await this.queryProducts(query, dto);

    const responseCompanies = [];
    datas.forEach((x) => {
      responseCompanies.push(this.mapAdminProductResponse(x));
    });
    response.setData(responseCompanies, dataCount);
    return response;
  }

  async getClientProduct(
    query: Query,
    dto: GetProductDto,
  ): Promise<QueryRespone> {
    const response = new QueryRespone();
    const { datas, dataCount } = await this.queryProducts(query, dto);

    const responseCompanies = [];
    datas.forEach((x) => {
      responseCompanies.push(this.mapClientProductResponse(x));
    });
    response.setData(responseCompanies, dataCount);
    return response;
  }

  private async queryProducts(
    query: Query,
    dto: GetProductDto,
  ): Promise<{ datas: Product[]; dataCount: number }> {
    const resPerPage = Number(query.size) ?? 10000;
    const currentPage = Number(query.page) || 1;
    const skip = resPerPage * (currentPage - 1);
    const mongoQuery: Record<string, any> = {};

    if (dto.ItemId) {
      mongoQuery._id = dto.ItemId;
    }

    if (dto.Category && dto.Category !== 'ALL') {
      mongoQuery.Category = dto.Category;
    }

    if (dto.SubCategory && dto.SubCategory !== 'ALL') {
      mongoQuery.SubCategory = dto.SubCategory;
    }

    if (dto.MinMakingPrice != null || dto.MaxMakingPrice != null) {
      mongoQuery.MakingPrice = {};
      if (dto.MinMakingPrice != null) {
        mongoQuery.MakingPrice.$gte = dto.MinMakingPrice;
      }
      if (dto.MaxMakingPrice != null) {
        mongoQuery.MakingPrice.$lte = dto.MaxMakingPrice;
      }
    }

    if (dto.SearchTerm) {
      const escapedSearchTerm = dto.SearchTerm.replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&',
      );
      const searchRegex = new RegExp(escapedSearchTerm, 'i');
      mongoQuery.$or = [
        { ProductName: searchRegex },
        { Description: searchRegex },
      ];
    }

    const datas = await this.productModel
      .find(mongoQuery)
      .limit(resPerPage)
      .skip(skip);
    const dataCount = await this.productModel.countDocuments(mongoQuery);
    return { datas, dataCount };
  }

  private mapAdminProductResponse(x: Product): any {
    const imageLinks =
      x.ImageLinks && x.ImageLinks.length > 0
        ? x.ImageLinks
        : (x as any).ImageLink && typeof (x as any).ImageLink === 'string'
          ? [(x as any).ImageLink]
          : [];
    return {
      ItemId: x._id,
      ProductName: x.ProductName,
      Category: (x as any).Category ?? '',
      SubCategory: (x as any).SubCategory ?? '',
      NetHeight: (x as any).NetHeight ?? '',
      NetHeightUnit: 'feet',
      Description: x.Description,
      ImageLinks: imageLinks,
      VideoLink: x.VideoLink ?? '',
      MakingPrice: x.MakingPrice,
      WholeSalerPrice:
        (x as any).WholeSalerPrice ?? (x as any).SellingPrice ?? 0,
      EndUserPrice: (x as any).EndUserPrice ?? (x as any).SellingPrice ?? 0,
      EndUserDiscountedPrice:
        (x as any).EndUserDiscountedPrice ?? (x as any).SellingPrice ?? 0,
      Quantity: x.Quantity,
      CreatedDate: x.CreatedDate,
    };
  }

  private mapClientProductResponse(x: Product): any {
    const imageLinks =
      x.ImageLinks && x.ImageLinks.length > 0
        ? x.ImageLinks
        : (x as any).ImageLink && typeof (x as any).ImageLink === 'string'
          ? [(x as any).ImageLink]
          : [];
    return {
      ItemId: x._id,
      ProductName: x.ProductName,
      Category: (x as any).Category ?? '',
      SubCategory: (x as any).SubCategory ?? '',
      NetHeight: (x as any).NetHeight ?? '',
      NetHeightUnit: 'feet',
      Description: x.Description,
      ImageLinks: imageLinks,
      VideoLink: x.VideoLink ?? '',
      EndUserPrice: (x as any).EndUserPrice ?? (x as any).SellingPrice ?? 0,
      EndUserDiscountedPrice:
        (x as any).EndUserDiscountedPrice ?? (x as any).SellingPrice ?? 0,
      Quantity: x.Quantity,
      CreatedDate: x.CreatedDate,
    };
  }

  async addProduction(
    dto: AddProductionDto,
    user: User,
  ): Promise<CommandResponse> {
    const response = new CommandResponse();
    const uniqueProducts = new Set(dto.ProductionInfo.map((x) => x.ProductId));
    if (uniqueProducts.size !== dto.ProductionInfo.length) {
      throw new BadRequestException(
        'A product can appear only once per intake',
      );
    }

    const replay = await this.inventoryService.findRequestBatches(
      dto.RequestId,
    );
    if (replay.length) {
      this.assertReplayMatches(dto, replay);
      response.setSuccess({ Batches: replay, Replayed: true });
      return response;
    }

    const session = await this.productModel.db.startSession();
    const batches = [];
    try {
      await session.withTransaction(async () => {
        for (const entry of dto.ProductionInfo) {
          const result = await this.productModel.updateOne(
            { _id: entry.ProductId },
            { $inc: { Quantity: entry.Quantity } },
            { session, runValidators: true },
          );
          if (result.matchedCount !== 1) {
            throw new BadRequestException(
              'Product not found: ' + entry.ProductId,
            );
          }
          batches.push(
            await this.inventoryService.createBatch(
              entry.ProductId,
              entry.Quantity,
              String(user._id),
              dto.RequestId,
              session,
            ),
          );
        }
      });
    } catch (error) {
      if ((error as any)?.code === 11000) {
        const existing = await this.inventoryService.findRequestBatches(
          dto.RequestId,
        );
        if (existing.length) {
          this.assertReplayMatches(dto, existing);
          response.setSuccess({ Batches: existing, Replayed: true });
          return response;
        }
      }
      throw error;
    } finally {
      await session.endSession();
    }
    response.setSuccess({ Batches: batches });
    return response;
  }

  private assertReplayMatches(dto: AddProductionDto, batches: any[]) {
    const expected = new Map(
      dto.ProductionInfo.map((x) => [x.ProductId, x.Quantity]),
    );
    const matches =
      batches.length === expected.size &&
      batches.every(
        (batch) =>
          expected.get(batch.ProductId) === Number(batch.QuantityReceived),
      );
    if (!matches) {
      throw new ConflictException(
        'RequestId was already used for a different stock intake',
      );
    }
  }
}
