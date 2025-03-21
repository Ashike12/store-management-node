import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import * as mongoose from 'mongoose';
import { UserRoles } from 'src/shared/constant/roles.constant';
import { InjectModel } from '@nestjs/mongoose';
import { Query } from 'express-serve-static-core';
import { QueryRespone } from 'src/shared/response/query.response';
import { CommandResponse } from 'src/shared/response/command.response';
import { SharedService } from 'src/services/shared.service';
import { indexOf as _indexOf } from 'lodash';
import { CreateProductDto } from '../dto/product/create-product.dto';
import { Product } from 'src/shared/schemas/product.schema';
import { UpdateProductDto } from '../dto/product/update-product.dto';
import { GetProductDto } from '../dto/product/get-product.dto';
import { CreateInvoiceDto, ProductSellDto } from '../dto/product-sell/create-invoice.dto';
import { ProductSell } from 'src/shared/schemas/productSell.schema';
import { Invoice } from 'src/shared/schemas/invoice.schema';
import { User } from 'src/shared/schemas/user.schema';
import { GetInvoiceDto } from '../dto/product-sell/get-invoice.dto';

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

    const dataModel = {
      _id: this.sharedService.getUid(),
      ProductName: dto.ProductName,
      MakingPrice: dto.MakingPrice,
      SellingPrice: dto.SellingPrice,
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
    if (dto.MakingPrice != null) updates['MakingPrice'] = dto.MakingPrice;
    if (dto.SellingPrice != null) updates['SellingPrice'] = dto.SellingPrice;
    if (dto.Quantity != null) updates['Quantity'] = dto.Quantity;
    if (dto.Description != null) updates['Description'] = dto.Description;
    return updates;
  }

  async updateProduct(dto: UpdateProductDto): Promise<CommandResponse> {
    const response = new CommandResponse();
    const existingData = await this.productModel.findOne({ _id: dto.ItemId });
    // console.log(dto.ItemId);
    if (existingData == null) {
      throw new BadRequestException('No Data found with ItemId: ' + dto.ItemId);
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
    const resPerPage = Number(query.size) ?? 10000;
    const currentPage = Number(query.page) || 1;
    const skip = resPerPage * (currentPage - 1);
    // console.log(userId);
    let mongoQuery = dto.ItemId ? { _id: dto.ItemId } : {};

    const datas = await this.productModel
      .find(mongoQuery)
      .limit(resPerPage)
      .skip(skip);
    const dataCount = await this.productModel
      .countDocuments(mongoQuery);

    const responseCompanies = [];
    datas.forEach(x => {
      responseCompanies.push({
        ItemId: x._id,
        ProductName: x.ProductName,
        Description: x.Description,
        MakingPrice: x.MakingPrice,
        SellingPrice: x.SellingPrice,
        Quantity: x.Quantity,
        CreatedDate: x.CreatedDate
      });
    });
    response.setData(responseCompanies, dataCount);
    return response;
  }

  async createInvoice(dto: CreateInvoiceDto): Promise<CommandResponse> {
    // ToDo need validation so that sell quantity does not go above remaining product quantity
    if (dto.ProductSellInfo.length == 0) {
      throw new BadRequestException('No products added to sell');
    }
    const response = new CommandResponse();
    const wholesalerInfo = await this.userModel.findOne({ _id: dto.WholeSalerId });
    if (!wholesalerInfo) {
      throw new BadRequestException('Wholesaler not found');
    }
    const productSellData = dto.ProductSellInfo || [];
    const sellModels = [];
    let TotalSellAmount = 0;
    let TotalCostAmount = 0;
    const invoiceId = this.sharedService.getUid();
    for (const eachSell of productSellData) {
      const productInfo = await this.productModel.findOne({ _id: eachSell.ProductId });
      const currentProductSellAMount = eachSell.SellingPrice * eachSell.Quantity;
      TotalSellAmount += currentProductSellAMount;
      TotalCostAmount += (productInfo.MakingPrice * eachSell.Quantity);
      sellModels.push({
        _id: this.sharedService.getUid(),
        ProductId: eachSell.ProductId,
        SellingPrice: eachSell.SellingPrice,
        Quantity: eachSell.Quantity,
        SellingDate: eachSell.SellingDate,
        WholeSalerId: dto.WholeSalerId,
        InvoiceId: invoiceId,
        CreatedDate: new Date().toISOString()
      });
      const updateProductDto = {
        ItemId: eachSell.ProductId,
        Quantity: productInfo.Quantity - eachSell.Quantity
      } as UpdateProductDto;
      await this.updateProduct(updateProductDto);
    }
    const invoiceModel = {
      _id: invoiceId,
      TotalAmount: TotalSellAmount,
      PaymentAmount: dto.PaymentAmount,
      ProfitMargin: dto.PaymentAmount - TotalCostAmount,
      WholeSalerId: dto.WholeSalerId,
      CreatedDate: new Date().toISOString()
    }
    await this.productSellModel.insertMany(sellModels);
    await this.invoiceModel.create(invoiceModel);
    return response;
  }

  async getInvoice(query: Query, dto: GetInvoiceDto): Promise<QueryRespone> {
    const response = new QueryRespone();
    const resPerPage = Number(query.size) ?? 10000;
    const currentPage = Number(query.page) || 1;
    const skip = resPerPage * (currentPage - 1);
    // console.log(userId);
    let mongoQuery = dto.ItemId ? { _id: dto.ItemId } : {};

    const datas = await this.invoiceModel
      .find(mongoQuery)
      .limit(resPerPage)
      .skip(skip);
    const dataCount = await this.invoiceModel
      .countDocuments(mongoQuery);

    const responseCompanies = [];
    datas.forEach(x => {
      responseCompanies.push({
        ItemId: x._id,
        PaymentAmount: x.PaymentAmount,
        ProfitMargin: x.ProfitMargin,
        TotalAmount: x.TotalAmount,
        WholesalerId: x.WholesalerId,
        CreatedDate: x.CreatedDate
      });
    });
    response.setData(responseCompanies, dataCount);
    return response;
  }

  async deleteInvoiceById(id: string): Promise<CommandResponse> {
    const response = new CommandResponse();
    const existingData = await this.invoiceModel.findOne({ _id: id });
    if (!existingData) {
      throw new BadRequestException('Data not found');
    }

    await this.invoiceModel.findByIdAndDelete(id);
    return response;
  }

}
