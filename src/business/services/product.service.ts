import {
  BadRequestException,
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
import { CreateInvoiceDto, ProductSellDto } from '../dto/product-sell/create-invoice.dto';
import { ProductSell } from '../../shared/schemas/productSell.schema';
import { Invoice } from '../../shared/schemas/invoice.schema';
import { User } from '../../shared/schemas/user.schema';
import { GetInvoiceDto } from '../dto/product-sell/get-invoice.dto';
import { AddProductionDto } from '../dto/product/add-production.dto';
import { PRODUCT_CATEGORY_SUBCATEGORY_MAP } from '../../shared/constant/product.constant';

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
  ) {
  }
  async createProduct(dto: CreateProductDto): Promise<CommandResponse> {
    const response = new CommandResponse();

    const existingData = await this.productModel.findOne({ ProductName: dto.ProductName });
    if (existingData != null) {
      throw new BadRequestException('Same product already exists: ' + dto.ProductName);
    }
    this.validateCategoryAndSubCategory(dto.Category, dto.SubCategory);

    const dataModel = {
      _id: this.sharedService.getUid(),
      ProductName: dto.ProductName,
      Category: dto.Category,
      SubCategory: dto.SubCategory,
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
      CreatedDate: new Date().toISOString()
    }
    await this.productModel.create(dataModel);
    return response;
  }

  private createUpdateObject(dto: UpdateProductDto): any {
    const updates = {};
    if (dto.ProductName != null) updates['ProductName'] = dto.ProductName;
    if (dto.Category != null) updates['Category'] = dto.Category;
    if (dto.SubCategory != null) updates['SubCategory'] = dto.SubCategory;
    if (dto.ImageLinks != null) updates['ImageLinks'] = dto.ImageLinks;
    if (dto.VideoLink != null) updates['VideoLink'] = dto.VideoLink;
    if (dto.MakingPrice != null) updates['MakingPrice'] = dto.MakingPrice;
    if (dto.WholeSalerPrice != null) updates['WholeSalerPrice'] = dto.WholeSalerPrice;
    if (dto.EndUserPrice != null) updates['EndUserPrice'] = dto.EndUserPrice;
    if (dto.EndUserDiscountedPrice != null) updates['EndUserDiscountedPrice'] = dto.EndUserDiscountedPrice;
    if (dto.Quantity != null) updates['Quantity'] = dto.Quantity;
    if (dto.Description != null) updates['Description'] = dto.Description;
    return updates;
  }

  private validateCategoryAndSubCategory(category: string, subCategory: string): void {
    const allowedSubCategories = PRODUCT_CATEGORY_SUBCATEGORY_MAP[category];
    if (!allowedSubCategories) {
      throw new BadRequestException('Invalid category: ' + category);
    }

    if (!allowedSubCategories.includes(subCategory)) {
      throw new BadRequestException('Invalid sub category for selected category');
    }
  }

  async updateProduct(dto: UpdateProductDto): Promise<CommandResponse> {
    const response = new CommandResponse();
    const existingData = await this.productModel.findOne({ _id: dto.ItemId });
    // console.log(dto.ItemId);
    if (existingData == null) {
      throw new BadRequestException('No Data found with ItemId: ' + dto.ItemId);
    }

    const nextCategory = dto.Category ?? (existingData as any).Category;
    const nextSubCategory = dto.SubCategory ?? (existingData as any).SubCategory;
    if (nextCategory && nextSubCategory) {
      this.validateCategoryAndSubCategory(nextCategory, nextSubCategory);
    }

    await this.productModel.findByIdAndUpdate(dto.ItemId, this.createUpdateObject(dto), {
      new: true,
      runValidators: true,
    });

    return response;
  }

  async deleteById(id: string): Promise<CommandResponse> {
    const response = new CommandResponse();
    const existingData = await this.productModel.findOne({ _id: id });
    if (!existingData) {
      throw new BadRequestException('Data not found');
    }

    await this.productModel.findByIdAndDelete(id);
    return response;
  }

  async getProduct(query: Query, dto: GetProductDto): Promise<QueryRespone> {
    const response = new QueryRespone();
    const { datas, dataCount } = await this.queryProducts(query, dto);

    const responseCompanies = [];
    datas.forEach(x => {
      responseCompanies.push(this.mapAdminProductResponse(x));
    });
    response.setData(responseCompanies, dataCount);
    return response;
  }

  async getClientProduct(query: Query, dto: GetProductDto): Promise<QueryRespone> {
    const response = new QueryRespone();
    const { datas, dataCount } = await this.queryProducts(query, dto);

    const responseCompanies = [];
    datas.forEach(x => {
      responseCompanies.push(this.mapClientProductResponse(x));
    });
    response.setData(responseCompanies, dataCount);
    return response;
  }

  private async queryProducts(query: Query, dto: GetProductDto): Promise<{ datas: Product[]; dataCount: number }> {
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

    const datas = await this.productModel
      .find(mongoQuery)
      .limit(resPerPage)
      .skip(skip);
    const dataCount = await this.productModel
      .countDocuments(mongoQuery);
    return { datas, dataCount };
  }

  private mapAdminProductResponse(x: Product): any {
    const imageLinks = x.ImageLinks && x.ImageLinks.length > 0
      ? x.ImageLinks
      : (((x as any).ImageLink && typeof (x as any).ImageLink === 'string') ? [(x as any).ImageLink] : []);
    return {
      ItemId: x._id,
      ProductName: x.ProductName,
      Category: (x as any).Category ?? '',
      SubCategory: (x as any).SubCategory ?? '',
      Description: x.Description,
      ImageLinks: imageLinks,
      VideoLink: x.VideoLink ?? '',
      MakingPrice: x.MakingPrice,
      WholeSalerPrice: (x as any).WholeSalerPrice ?? (x as any).SellingPrice ?? 0,
      EndUserPrice: (x as any).EndUserPrice ?? (x as any).SellingPrice ?? 0,
      EndUserDiscountedPrice: (x as any).EndUserDiscountedPrice ?? (x as any).SellingPrice ?? 0,
      Quantity: x.Quantity,
      CreatedDate: x.CreatedDate
    };
  }

  private mapClientProductResponse(x: Product): any {
    const imageLinks = x.ImageLinks && x.ImageLinks.length > 0
      ? x.ImageLinks
      : (((x as any).ImageLink && typeof (x as any).ImageLink === 'string') ? [(x as any).ImageLink] : []);
    return {
      ItemId: x._id,
      ProductName: x.ProductName,
      Category: (x as any).Category ?? '',
      SubCategory: (x as any).SubCategory ?? '',
      Description: x.Description,
      ImageLinks: imageLinks,
      VideoLink: x.VideoLink ?? '',
      EndUserPrice: (x as any).EndUserPrice ?? (x as any).SellingPrice ?? 0,
      EndUserDiscountedPrice: (x as any).EndUserDiscountedPrice ?? (x as any).SellingPrice ?? 0,
      Quantity: x.Quantity,
      CreatedDate: x.CreatedDate
    };
  }

  async addProduction(dto: AddProductionDto): Promise<CommandResponse> {
    const response = new CommandResponse();

    for (const eachProduct of dto.ProductionInfo) {
      let productUpdateDto = new UpdateProductDto();
      productUpdateDto.Quantity = eachProduct.Quantity;
      await this.productModel.findByIdAndUpdate(eachProduct.ProductId, this.createUpdateObject(productUpdateDto), {
        new: true,
        runValidators: true,
      });
    }

    return response;
  }
}
