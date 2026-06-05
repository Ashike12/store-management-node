import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import * as mongoose from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Query } from 'express-serve-static-core';
import { QueryRespone } from '../../shared/response/query.response';
import { CommandResponse } from '../../shared/response/command.response';
import { SharedService } from '../../services/shared.service';
import { indexOf as _indexOf } from 'lodash';
import { Product } from '../../shared/schemas/product.schema';
import { UpdateProductDto } from '../dto/product/update-product.dto';
import { CreateInvoiceDto } from '../dto/product-sell/create-invoice.dto';
import { ProductSell } from '../../shared/schemas/productSell.schema';
import { Invoice } from '../../shared/schemas/invoice.schema';
import { User } from '../../shared/schemas/user.schema';
import { GetInvoiceDto } from '../dto/product-sell/get-invoice.dto';
import { ProductService } from './product.service';
import { UpdateInvoiceDto } from '../dto/product-sell/update-invoice.dto';
import { INVOICE_CONSTANT } from '../../shared/constant/invoice.constant';
import { startOfMonth, addMonths } from 'date-fns';
import { UserRoles } from '../../shared/constant/roles.constant';

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

  private isWholesalerUser(user?: User | null): boolean {
    return !!user?.Roles?.includes(UserRoles.WholeSaler);
  }

  private getInvoiceAccessQuery(user?: User | null, baseQuery: Record<string, any> = {}): Record<string, any> {
    if (!this.isWholesalerUser(user)) {
      return baseQuery;
    }

    return {
      ...baseQuery,
      WholeSalerId: user!._id,
    };
  }

  private getProductSellAccessQuery(user?: User | null, baseQuery: Record<string, any> = {}): Record<string, any> {
    if (!this.isWholesalerUser(user)) {
      return baseQuery;
    }

    return {
      ...baseQuery,
      WholeSalerId: user!._id,
    };
  }

  private sanitizeInvoiceForWholesaler<T extends Record<string, any>>(invoice: T, user?: User | null): T {
    if (!this.isWholesalerUser(user)) {
      return invoice;
    }

    const { ProfitMargin, ...safeInvoice } = invoice;
    return safeInvoice as T;
  }

  private sanitizeDashboardForWholesaler(responseData: Record<string, any>, user?: User | null) {
    if (!this.isWholesalerUser(user)) {
      return responseData;
    }

    return {
      ThisMonthTotalInvoice: responseData.ThisMonthTotalInvoice,
      TotalDueAmount: responseData.TotalDueAmount,
      RecentInvoiceData: (responseData.RecentInvoiceData || []).map((invoice: Record<string, any>) =>
        this.sanitizeInvoiceForWholesaler(invoice, user),
      ),
    };
  }

  async createInvoice(dto: CreateInvoiceDto): Promise<CommandResponse> {
    const response = new CommandResponse();
    const isDuePaymentInvoice = dto.InvoiceType === INVOICE_CONSTANT.DUE_PAYMENT;
    const isProductInvoice = dto.InvoiceType !== INVOICE_CONSTANT.DUE_PAYMENT;
    const productSellData = dto.ProductSellInfo || [];

    if (isProductInvoice && productSellData.length === 0) {
      throw new BadRequestException('At least one product is required for product invoice');
    }

    if (isDuePaymentInvoice && !dto.WholeSalerId) {
      throw new BadRequestException('Wholesaler is required for due payment invoice');
    }

    let wholesalerInfo: User | null = null;
    if (dto.WholeSalerId) {
      wholesalerInfo = await this.userModel.findOne({ _id: dto.WholeSalerId });
    }

    if (
      (dto.InvoiceType === INVOICE_CONSTANT.WHOLESALE || isDuePaymentInvoice) &&
      !wholesalerInfo
    ) {
      throw new BadRequestException('Wholesaler not found');
    }

    const sellModels = [];
    let TotalSellAmount = 0;
    let TotalCostAmount = 0;
    const invoiceId = this.sharedService.getUid();
    const invoiceNumberPrefix = isDuePaymentInvoice
      ? 'DP'
      : (((wholesalerInfo && wholesalerInfo.FirstName[0]) ?? "X") + ((wholesalerInfo && wholesalerInfo.LastName[0]) ?? "Y"));
    const invoiceNumber = `${invoiceNumberPrefix}${new Date().getTime()}`;

    for (const eachSell of productSellData) {
      const productInfo = await this.productModel.findOne({ _id: eachSell.ProductId });
      if (!productInfo) {
        throw new BadRequestException(`Product not found: ${eachSell.ProductId}`);
      }
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
        WholeSalerName: (wholesalerInfo && wholesalerInfo?.DisplayName) ?? '',
        InvoiceId: invoiceId,
        IdsAllowedToRead: dto.WholeSalerId ? [dto.WholeSalerId] : [],
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
      TotalAmount: isDuePaymentInvoice ? dto.PaymentAmount : TotalSellAmount,
      PaymentAmount: dto.PaymentAmount,
      ProfitMargin: isDuePaymentInvoice ? dto.PaymentAmount : (dto.PaymentAmount - TotalCostAmount),
      WholeSalerId: dto.WholeSalerId,
      WholeSalerName: (wholesalerInfo && wholesalerInfo?.DisplayName) ?? '',
      InvoiceType: dto.InvoiceType,
      InvoiceNumber: invoiceNumber,
      IdsAllowedToRead: dto.WholeSalerId ? [dto.WholeSalerId] : [],
      CreatedDate: new Date().toISOString()
    }
    if (sellModels.length > 0) {
      await this.productSellModel.insertMany(sellModels);
    }
    await this.invoiceModel.create(invoiceModel);
    return response;
  }

  async getInvoiceList(query: Query, dto: GetInvoiceDto, loggedInUser?: User): Promise<QueryRespone> {
    const response = new QueryRespone();
    const resPerPage = Number(query.size) ?? 10000;
    const currentPage = Number(query.page) || 1;
    const skip = resPerPage * (currentPage - 1);
    // console.log(userId);
    let mongoQuery: any = dto.ItemId ? { _id: dto.ItemId } : {};

    if (!!dto.WholesalerId && !this.isWholesalerUser(loggedInUser)) {
      mongoQuery = { WholeSalerId: dto.WholesalerId };
    }

    mongoQuery = this.getInvoiceAccessQuery(loggedInUser, mongoQuery);

    const datas = await this.invoiceModel
      .find(mongoQuery)
      .sort({ CreatedDate: -1 })
      .limit(resPerPage)
      .skip(skip);
    const dataCount = await this.invoiceModel
      .countDocuments(mongoQuery);

    const responseCompanies = [];
    datas.forEach(x => {
      const normalizedInvoice = this.normalizeInvoiceAmounts(x.toObject());
      responseCompanies.push(this.sanitizeInvoiceForWholesaler({
        ItemId: normalizedInvoice._id,
        InvoiceNumber: normalizedInvoice.InvoiceNumber,
        PaymentAmount: normalizedInvoice.PaymentAmount,
        ProfitMargin: normalizedInvoice.ProfitMargin,
        TotalAmount: normalizedInvoice.TotalAmount,
        WholeSalerId: normalizedInvoice.WholeSalerId,
        InvoiceType: normalizedInvoice.InvoiceType ?? INVOICE_CONSTANT.WHOLESALE,
        WholeSalerName: normalizedInvoice.WholeSalerName,
        CreatedDate: normalizedInvoice.CreatedDate
      }, loggedInUser));
    });
    if (!!dto.ItemId) {
      return await this.getInvoiceByIdResponse(responseCompanies, loggedInUser);
    }
    response.setData(responseCompanies, dataCount);
    return response;
  }

  private async getInvoiceByIdResponse(data: any[], loggedInUser?: User): Promise<QueryRespone> {
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
    response.setData(this.sanitizeInvoiceForWholesaler(invoiceDetails, loggedInUser), 1);
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

    const isDuePaymentInvoice = dto.InvoiceType === INVOICE_CONSTANT.DUE_PAYMENT;
    const isProductInvoice = dto.InvoiceType !== INVOICE_CONSTANT.DUE_PAYMENT;
    const productSellData = dto.ProductSellInfo || [];

    if (isProductInvoice && productSellData.length === 0) {
      throw new BadRequestException('At least one product is required for product invoice');
    }

    if (isDuePaymentInvoice && !dto.WholeSalerId) {
      throw new BadRequestException('Wholesaler is required for due payment invoice');
    }

    let wholesalerInfo: User | null = null;
    if (dto.WholeSalerId) {
      wholesalerInfo = await this.userModel.findOne({ _id: dto.WholeSalerId });
    }

    if (
      (dto.InvoiceType === INVOICE_CONSTANT.WHOLESALE || isDuePaymentInvoice) &&
      !wholesalerInfo
    ) {
      throw new BadRequestException('Wholesaler not found');
    }

    await this.restoreOldSells(dto.ItemId);
    const sellModels = [];
    let TotalSellAmount = 0;
    let TotalCostAmount = 0;
    for (const eachSell of productSellData) {
      const productInfo = await this.productModel.findOne({ _id: eachSell.ProductId });
      if (!productInfo) {
        throw new BadRequestException(`Product not found: ${eachSell.ProductId}`);
      }
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
        WholeSalerName: (wholesalerInfo && wholesalerInfo?.DisplayName) ?? '',
        InvoiceId: existingData._id,
        IdsAllowedToRead: dto.WholeSalerId ? [dto.WholeSalerId] : [],
        CreatedDate: new Date().toISOString()
      });
      const updateProductDto = {
        ItemId: eachSell.ProductId,
        Quantity: productInfo.Quantity - eachSell.Quantity
      } as UpdateProductDto;
      await this.productService.updateProduct(updateProductDto);
    }
    if (sellModels.length > 0) {
      await this.productSellModel.insertMany(sellModels);
    }
    await this.invoiceModel.findByIdAndUpdate(dto.ItemId,
      this.createInvoiceUpdateObject(dto.PaymentAmount,
        isDuePaymentInvoice ? dto.PaymentAmount : (dto.PaymentAmount - TotalCostAmount),
        isDuePaymentInvoice ? dto.PaymentAmount : TotalSellAmount,
        dto.InvoiceType,
        dto.WholeSalerId,
        (wholesalerInfo && wholesalerInfo?.DisplayName) ?? ''), {
      new: true,
      runValidators: true,
    });

    return response;
  }

  private normalizeInvoiceAmounts<T extends Pick<Invoice, 'InvoiceType' | 'PaymentAmount' | 'ProfitMargin' | 'TotalAmount'>>(invoice: T): T {
    if (invoice.InvoiceType !== INVOICE_CONSTANT.DUE_PAYMENT) {
      return invoice;
    }

    return {
      ...invoice,
      TotalAmount: invoice.PaymentAmount,
      ProfitMargin: invoice.PaymentAmount,
    };
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

  private createInvoiceUpdateObject(
    paymentAMount: any,
    profitMargin: any,
    totalAmount: any,
    invoiceType: string,
    wholeSalerId: string,
    wholeSalerName: string,
  ): any {
    const updates = {};
    if (totalAmount != null) updates['TotalAmount'] = totalAmount;
    if (paymentAMount != null) updates['PaymentAmount'] = paymentAMount;
    if (profitMargin != null) updates['ProfitMargin'] = profitMargin;
    if (invoiceType != null) updates['InvoiceType'] = invoiceType;
    if (wholeSalerId != null) updates['WholeSalerId'] = wholeSalerId;
    if (wholeSalerName != null) updates['WholeSalerName'] = wholeSalerName;
    return updates;
  }

  public async getDashboardStatsData(loggedInUser?: User): Promise<QueryRespone> {
    const response = new QueryRespone();
    const invoiceFilter = this.getInvoiceAccessQuery(loggedInUser);
    const productSellFilter = this.getProductSellAccessQuery(loggedInUser);
    const revenueGroupedByDate = await this.getRevenueGroupedByDate(invoiceFilter);
    const productSalesInfo = await this.getProductSalesInfo(productSellFilter);
    const wholeSalersSalesInfo = await this.getWholeSalersSalesInfo(invoiceFilter);
    const totalRevenueOfThisMonth = await this.getThisMonthRevenue(invoiceFilter);
    const totalInvoices = await this.invoiceModel.countDocuments(invoiceFilter);
    const totalSell = await this.getThisMonthTotalSold(productSellFilter);
    const totalDueAmount = await this.getTotalDueAmount(invoiceFilter);
    const recentInvoiceDocs = await this.invoiceModel.find(invoiceFilter).sort({ CreatedDate: -1 }).limit(5);
    const recentInvoiceData = recentInvoiceDocs.map(invoice => this.normalizeInvoiceAmounts(invoice.toObject()));
    const consumerData = wholeSalersSalesInfo.find( x => x.name == '');
    if(consumerData) {
      consumerData.name = 'Consumer';
    }
    const responseData = {
      SalesData: revenueGroupedByDate,
      ProductSalesInfo: productSalesInfo,
      WholesalerData: wholeSalersSalesInfo,
      ThisMonthRevenue: totalRevenueOfThisMonth,
      ThisMonthTotalInvoice: totalInvoices,
      ThisMonthTotalSell: totalSell,
      TotalDueAmount: totalDueAmount,
      RecentInvoiceData: recentInvoiceData,
    }
    response.setData(this.sanitizeDashboardForWholesaler(responseData, loggedInUser), 0)
    return response;
  }

  async getRevenueGroupedByDate(filter: Record<string, any> = {}): Promise<{ date: string; revenue: number }[]> {
    const result = await this.invoiceModel.aggregate([
      {
        $match: filter,
      },
      {
        $project: {
          date: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: { $toDate: '$CreatedDate' },
            },
          },
          revenue: {
            $cond: [
              { $eq: ['$InvoiceType', INVOICE_CONSTANT.DUE_PAYMENT] },
              '$PaymentAmount',
              '$ProfitMargin',
            ],
          },
        },
      },
      {
        $group: {
          _id: '$date',
          revenue: { $sum: '$revenue' },
        },
      },
      {
        $project: {
          _id: 0,
          date: '$_id',
          revenue: 1,
        },
      },
      {
        $sort: { date: 1 },
      },
    ]);
    return result;
  }

  async getProductSalesInfo(filter: Record<string, any> = {}): Promise<{ name: string; sales: number }[]> {
    const result = await this.productSellModel.aggregate([
      {
        $match: filter,
      },
      {
        $group: {
          _id: '$ProductName',
          sales: { $sum: '$Quantity' },
        },
      },
      {
        $project: {
          _id: 0,
          name: '$_id',
          sales: 1,
        },
      },
      {
        $sort: { name: 1 },
      },
    ]);
    return result;
  }

  async getWholeSalersSalesInfo(filter: Record<string, any> = {}): Promise<{ name: string; value: number }[]> {
    const result = await this.invoiceModel.aggregate([
      {
        $match: filter,
      },
      {
        $group: {
          _id: '$WholeSalerName',
          value: { $sum: '$PaymentAmount' },
        },
      },
      {
        $project: {
          _id: 0,
          name: '$_id',
          value: 1,
        },
      },
      {
        $sort: { name: 1 },
      },
    ]);
    return result;
  }
  async getThisMonthRevenue(filter: Record<string, any> = {}): Promise<number> {
    const now = new Date();

    const start = startOfMonth(now);
    const end = startOfMonth(addMonths(now, 1));

    const result = await this.invoiceModel.aggregate([
      {
        $addFields: {
          CreatedDateObj: { $toDate: '$CreatedDate' }, // 👈 Convert string to date
        },
      },
      {
        $match: {
          ...filter,
          CreatedDateObj: {
            $gte: start,
            $lt: end,
          },
        },
      },
      {
        $project: {
          CreatedDateObj: 1,
          revenue: {
            $cond: [
              { $eq: ['$InvoiceType', INVOICE_CONSTANT.DUE_PAYMENT] },
              '$PaymentAmount',
              '$ProfitMargin',
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$revenue' },
        },
      },
      {
        $project: {
          _id: 0,
          totalRevenue: 1,
        },
      },
    ]);
    return result.length > 0 ? result[0].totalRevenue : 0;
  }
  async getThisMonthTotalSold(filter: Record<string, any> = {}): Promise<number> {
    const now = new Date();

    const start = startOfMonth(now);
    const end = startOfMonth(addMonths(now, 1));

    const result = await this.productSellModel.aggregate([
      {
        $addFields: {
          CreatedDateObj: { $toDate: '$CreatedDate' }, // 👈 Convert string to date
        },
      },
      {
        $match: {
          ...filter,
          CreatedDateObj: {
            $gte: start,
            $lt: end,
          },
        },
      },
      {
        $group: {
          _id: null,
          totalSell: { $sum: '$Quantity' },
        },
      },
      {
        $project: {
          _id: 0,
          totalSell: 1,
        },
      },
    ]);
    return result.length > 0 ? result[0].totalSell : 0;
  }

  async getTotalDueAmount(filter: Record<string, any> = {}): Promise<number> {
    const result = await this.invoiceModel.aggregate([
      {
        $match: filter,
      },
      {
        $project: {
          dueAmount: {
            $subtract: [
              {
                $cond: [
                  { $eq: ['$InvoiceType', INVOICE_CONSTANT.DUE_PAYMENT] },
                  '$PaymentAmount',
                  '$TotalAmount',
                ],
              },
              '$PaymentAmount',
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          totalDueAmount: { $sum: '$dueAmount' },
        },
      },
      {
        $project: {
          _id: 0,
          totalDueAmount: 1,
        },
      },
    ]);

    return result.length > 0 ? result[0].totalDueAmount : 0;
  }
}
