import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import * as mongoose from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Query } from 'express-serve-static-core';
import { QueryRespone } from 'src/shared/response/query.response';
import { CommandResponse } from 'src/shared/response/command.response';
import { SharedService } from 'src/services/shared.service';
import { indexOf as _indexOf } from 'lodash';
import { Product } from 'src/shared/schemas/product.schema';
import { UpdateProductDto } from '../dto/product/update-product.dto';
import { CreateInvoiceDto } from '../dto/product-sell/create-invoice.dto';
import { ProductSell } from 'src/shared/schemas/productSell.schema';
import { Invoice } from 'src/shared/schemas/invoice.schema';
import { User } from 'src/shared/schemas/user.schema';
import { GetInvoiceDto } from '../dto/product-sell/get-invoice.dto';
import { ProductService } from './product.service';
import { ProductSellDto, UpdateInvoiceDto } from '../dto/product-sell/update-invoice.dto';

@Injectable()
export class InvoiceService {
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
    private productService: ProductService,
  ) {
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
    const invoiceNumber = (wholesalerInfo.FirstName[0] ?? "X") + (wholesalerInfo.LastName[0] ?? "Y") + new Date().getTime();
    for (const eachSell of productSellData) {
      const productInfo = await this.productModel.findOne({ _id: eachSell.ProductId });
      const currentProductSellAMount = eachSell.SellingPrice * eachSell.Quantity;
      TotalSellAmount += currentProductSellAMount;
      TotalCostAmount += (productInfo.MakingPrice * eachSell.Quantity);
      sellModels.push({
        _id: this.sharedService.getUid(),
        ProductId: eachSell.ProductId,
        ProductName: productInfo.ProductName,
        SellingPrice: eachSell.SellingPrice,
        Quantity: eachSell.Quantity,
        WholeSalerId: dto.WholeSalerId,
        WholeSalerName: wholesalerInfo.DisplayName,
        InvoiceId: invoiceId,
        IdsAllowedToRead: [dto.WholeSalerId],
        CreatedDate: new Date().toISOString()
      });
      const updateProductDto = {
        ItemId: eachSell.ProductId,
        Quantity: productInfo.Quantity - eachSell.Quantity
      } as UpdateProductDto;
      await this.productService.updateProduct(updateProductDto);
    }
    const invoiceModel = {
      _id: invoiceId,
      TotalAmount: TotalSellAmount,
      PaymentAmount: dto.PaymentAmount,
      ProfitMargin: dto.PaymentAmount - TotalCostAmount,
      WholeSalerId: dto.WholeSalerId,
      WholeSalerName: wholesalerInfo.DisplayName,
      InvoiceNumber: invoiceNumber,
      IdsAllowedToRead: [dto.WholeSalerId],
      CreatedDate: new Date().toISOString()
    }
    await this.productSellModel.insertMany(sellModels);
    await this.invoiceModel.create(invoiceModel);
    return response;
  }

  async getInvoiceList(query: Query, dto: GetInvoiceDto): Promise<QueryRespone> {
    const response = new QueryRespone();
    const resPerPage = Number(query.size) ?? 10000;
    const currentPage = Number(query.page) || 1;
    const skip = resPerPage * (currentPage - 1);
    // console.log(userId);
    let mongoQuery: any = dto.ItemId ? { _id: dto.ItemId } : {};

    if (!!dto.WholesalerId) {
      mongoQuery = { WholeSalerId: dto.WholesalerId };
    }

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
        InvoiceNumber: x.InvoiceNumber,
        PaymentAmount: x.PaymentAmount,
        ProfitMargin: x.ProfitMargin,
        TotalAmount: x.TotalAmount,
        WholeSalerId: x.WholeSalerId,
        WholeSalerName: x.WholeSalerName,
        CreatedDate: x.CreatedDate
      });
    });
    if (!!dto.ItemId) {
      return await this.getInvoiceByIdResponse(responseCompanies);
    }
    response.setData(responseCompanies, dataCount);
    return response;
  }

  private async getInvoiceByIdResponse(data: any[]): Promise<QueryRespone> {
    const response = new QueryRespone();
    if (data.length !== 1) {
      throw new BadRequestException('Data not found or multiple data exists');
    }
    const invoiceDetails = data[0];
    invoiceDetails.ProductSellInfo = [];
    const datas = await this.productSellModel.find({ InvoiceId: invoiceDetails.ItemId });
    datas.forEach(x => {
      invoiceDetails.ProductSellInfo.push({
        ItemId: x._id,
        InvoiceId: x.InvoiceId,
        CreatedDate: x.CreatedDate,
        SellingPrice: x.SellingPrice,
        ProductId: x.ProductId,
        ProductName: x.ProductName,
        Quantity: x.Quantity,
        WholeSalerId: x.WholeSalerId,
        WholeSalerName: x.WholeSalerName
      });
    });
    response.setData(invoiceDetails, 1);
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

  async updateInvoice(dto: UpdateInvoiceDto): Promise<CommandResponse> {
    const response = new CommandResponse();
    const existingData = await this.invoiceModel.findOne({ _id: dto.ItemId });
    if (!existingData) {
      throw new BadRequestException('Invoice not found');
    }
    await this.restoreOldSells(dto.ItemId);
    const sellModels = [];
    let TotalSellAmount = 0;
    let TotalCostAmount = 0;
    for (const eachSell of dto.ProductSellInfo) {
      const productInfo = await this.productModel.findOne({ _id: eachSell.ProductId });
      const currentProductSellAMount = eachSell.SellingPrice * eachSell.Quantity;
      TotalSellAmount += currentProductSellAMount;
      TotalCostAmount += (productInfo.MakingPrice * eachSell.Quantity);
      sellModels.push({
        _id: this.sharedService.getUid(),
        ProductId: eachSell.ProductId,
        ProductName: productInfo.ProductName,
        SellingPrice: eachSell.SellingPrice,
        Quantity: eachSell.Quantity,
        WholeSalerId: dto.WholeSalerId,
        WholeSalerName: existingData.WholeSalerName,
        InvoiceId: existingData._id,
        IdsAllowedToRead: [dto.WholeSalerId],
        CreatedDate: new Date().toISOString()
      });
      const updateProductDto = {
        ItemId: eachSell.ProductId,
        Quantity: productInfo.Quantity - eachSell.Quantity
      } as UpdateProductDto;
      await this.productService.updateProduct(updateProductDto);
    }
    if(sellModels.length > 0) {
      await this.productSellModel.insertMany(sellModels);
    }
    await this.invoiceModel.findByIdAndUpdate(dto.ItemId, 
      this.createInvoiceUpdateObject(dto.PaymentAmount,
        dto.PaymentAmount - TotalCostAmount, TotalSellAmount), {
      new: true,
      runValidators: true,
    });
    
    return response;
  }

  private async restoreOldSells(invoiceId: string) {
    const sellProducts = await this.productSellModel.find({ InvoiceId: invoiceId });
    await this.productSellModel.deleteMany({ InvoiceId: invoiceId });
    for (const eachSell of sellProducts) {
      const productInfo = await this.productModel.findOne({ _id: eachSell.ProductId });
      const updateProductDto = {
        ItemId: eachSell.ProductId,
        Quantity: productInfo.Quantity + eachSell.Quantity // increase the old sell value
      } as UpdateProductDto;
      await this.productService.updateProduct(updateProductDto);
    }
  }

  private createInvoiceUpdateObject(paymentAMount: any, profitMargin: any, totalAmount: any): any {
    const updates = {};
    if (totalAmount != null) updates['TotalAmount'] = totalAmount;
    if (paymentAMount != null) updates['PaymentAmount'] = paymentAMount;
    if (profitMargin != null) updates['ProfitMargin'] = profitMargin;
    return updates;
  }

  private createProductSellUpdateObject(dto: ProductSellDto): any {
    const updates = {};
    if (dto.ProductId != null) updates['ProductId'] = dto.ProductId;
    if (dto.Quantity != null) updates['TotalAmount'] = dto.Quantity;
    if (dto.SellingPrice != null) updates['SellingPrice'] = dto.SellingPrice;
    return updates;
  }

}
