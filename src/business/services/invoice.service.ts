import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import * as mongoose from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Query } from 'express-serve-static-core';
import { QueryRespone } from '../../shared/response/query.response';
import { CommandResponse } from '../../shared/response/command.response';
import { SharedService } from '../../services/shared.service';
import { Product } from '../../shared/schemas/product.schema';
import { CreateInvoiceDto } from '../dto/product-sell/create-invoice.dto';
import { ProductSell } from '../../shared/schemas/productSell.schema';
import { Invoice } from '../../shared/schemas/invoice.schema';
import { User } from '../../shared/schemas/user.schema';
import { GetInvoiceDto } from '../dto/product-sell/get-invoice.dto';
import { UpdateInvoiceDto } from '../dto/product-sell/update-invoice.dto';
import { INVOICE_CONSTANT } from '../../shared/constant/invoice.constant';
import { startOfMonth, addMonths } from 'date-fns';
import { UserRoles } from '../../shared/constant/roles.constant';
import { ORDER_LIMITS } from '../../shared/constant/order-validation.constant';

type InvoiceFinancialSummary = {
  TotalBilled: number;
  ProductCostAmount: number;
  CashCollected: number;
  GrossProfit: number;
  RealizedCashMargin: number;
  OutstandingDue: number;
  CustomerCredit: number;
  CostAtRisk: number;
};

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
  ) {}

  private isAdminUser(user?: User | null): boolean {
    return !!user?.Roles?.includes(UserRoles.Admin);
  }

  private isWholesalerUser(user?: User | null): boolean {
    return (
      !!user?.Roles?.includes(UserRoles.WholeSaler) && !this.isAdminUser(user)
    );
  }

  private authorizeAdmin(user?: User | null): void {
    if (!this.isAdminUser(user)) {
      throw new ForbiddenException('Admin access required');
    }
  }

  private authorizeInvoiceRead(user?: User | null): void {
    if (!this.isAdminUser(user) && !this.isWholesalerUser(user)) {
      throw new ForbiddenException(
        'Invoice access requires admin or wholesaler',
      );
    }
  }

  private getInvoiceAccessQuery(
    user?: User | null,
    baseQuery: Record<string, any> = {},
  ): Record<string, any> {
    if (!this.isWholesalerUser(user)) {
      return baseQuery;
    }

    return {
      ...baseQuery,
      WholeSalerId: user!._id,
    };
  }

  private getProductSellAccessQuery(
    user?: User | null,
    baseQuery: Record<string, any> = {},
  ): Record<string, any> {
    if (!this.isWholesalerUser(user)) {
      return baseQuery;
    }

    return {
      ...baseQuery,
      WholeSalerId: user!._id,
    };
  }

  private sanitizeInvoiceForWholesaler<T extends Record<string, any>>(
    invoice: T,
    user?: User | null,
  ): T {
    if (!this.isWholesalerUser(user)) {
      return invoice;
    }

    const {
      ProductCostAmount,
      GrossProfit,
      RealizedCashMargin,
      ...safeInvoice
    } = invoice;
    return safeInvoice as T;
  }

  private sanitizeFinancialSummaryForWholesaler(
    summary: InvoiceFinancialSummary,
    user?: User | null,
  ): Partial<InvoiceFinancialSummary> {
    if (!this.isWholesalerUser(user)) return summary;
    return {
      TotalBilled: summary.TotalBilled,
      CashCollected: summary.CashCollected,
      OutstandingDue: summary.OutstandingDue,
      CustomerCredit: summary.CustomerCredit,
    };
  }

  private sanitizeDashboardForWholesaler(
    responseData: Record<string, any>,
    user?: User | null,
  ) {
    if (!this.isWholesalerUser(user)) {
      return responseData;
    }

    return {
      ThisMonthTotalInvoice: responseData.ThisMonthTotalInvoice,
      TotalOutstandingDue: responseData.TotalOutstandingDue,
      TotalCustomerCredit: responseData.TotalCustomerCredit,
      RecentInvoiceData: (responseData.RecentInvoiceData || []).map(
        (invoice: Record<string, any>) =>
          this.sanitizeInvoiceForWholesaler(invoice, user),
      ),
    };
  }

  async createInvoice(
    dto: CreateInvoiceDto,
    loggedInUser?: User,
  ): Promise<CommandResponse> {
    this.authorizeAdmin(loggedInUser);
    this.validateInvoiceInput(dto);

    return this.runInTransaction(async (session) => {
      const response = new CommandResponse();
      const wholesalerInfo = await this.resolveWholesaler(dto, session);
      const invoiceId = this.sharedService.getUid();
      const prepared = await this.prepareProductSells(
        dto,
        invoiceId,
        wholesalerInfo,
        session,
      );
      const isDuePaymentInvoice =
        dto.InvoiceType === INVOICE_CONSTANT.DUE_PAYMENT;
      const invoiceNumberPrefix = isDuePaymentInvoice
        ? 'DP'
        : `${wholesalerInfo?.FirstName?.[0] ?? 'X'}${
            wholesalerInfo?.LastName?.[0] ?? 'Y'
          }`;
      const invoiceModel = {
        _id: invoiceId,
        TotalAmount: isDuePaymentInvoice
          ? dto.PaymentAmount
          : prepared.totalSellAmount,
        PaymentAmount: dto.PaymentAmount,
        ProductCostAmount: isDuePaymentInvoice ? 0 : prepared.totalCostAmount,
        GrossProfit: isDuePaymentInvoice
          ? 0
          : prepared.totalSellAmount - prepared.totalCostAmount,
        RealizedCashMargin: dto.PaymentAmount - prepared.totalCostAmount,
        WholeSalerId: dto.WholeSalerId || '',
        WholeSalerName: wholesalerInfo?.DisplayName ?? '',
        InvoiceType: dto.InvoiceType,
        InvoiceNumber: `${invoiceNumberPrefix}-${new Date().getTime()}-${invoiceId.slice(-8)}`,
        IdsAllowedToRead: dto.WholeSalerId ? [dto.WholeSalerId] : [],
        CreatedDate: new Date().toISOString(),
      };

      if (prepared.sellModels.length > 0) {
        await this.productSellModel.insertMany(prepared.sellModels, {
          session,
        });
      }
      await this.invoiceModel.create([invoiceModel], { session });
      return response;
    });
  }

  async getInvoiceList(
    query: Query,
    dto: GetInvoiceDto,
    loggedInUser?: User,
  ): Promise<QueryRespone> {
    this.authorizeInvoiceRead(loggedInUser);
    const response = new QueryRespone();
    const resPerPage = query.size === undefined ? 10 : Number(query.size);
    const currentPage = query.page === undefined ? 1 : Number(query.page);
    if (
      !Number.isInteger(resPerPage) ||
      resPerPage < 1 ||
      resPerPage > 100 ||
      !Number.isInteger(currentPage) ||
      currentPage < 1 ||
      currentPage > 1_000_000
    ) {
      throw new BadRequestException('Invalid invoice pagination');
    }
    const skip = resPerPage * (currentPage - 1);
    // console.log(userId);
    let mongoQuery: any = dto.ItemId ? { _id: dto.ItemId } : {};

    if (!!dto.WholesalerId && !this.isWholesalerUser(loggedInUser)) {
      mongoQuery = { ...mongoQuery, WholeSalerId: dto.WholesalerId };
    }

    mongoQuery = this.getInvoiceAccessQuery(loggedInUser, mongoQuery);

    const datas = await this.invoiceModel
      .find(mongoQuery)
      .sort({ CreatedDate: -1, _id: -1 })
      .limit(resPerPage)
      .skip(skip);
    const dataCount = await this.invoiceModel.countDocuments(mongoQuery);

    const responseCompanies = [];
    datas.forEach((x) => {
      const normalizedInvoice = this.normalizeInvoiceAmounts(x.toObject());
      responseCompanies.push(
        this.sanitizeInvoiceForWholesaler(
          {
            ItemId: normalizedInvoice._id,
            InvoiceNumber: normalizedInvoice.InvoiceNumber,
            PaymentAmount: normalizedInvoice.PaymentAmount,
            ProductCostAmount: normalizedInvoice.ProductCostAmount,
            GrossProfit: normalizedInvoice.GrossProfit,
            RealizedCashMargin: normalizedInvoice.RealizedCashMargin,
            TotalAmount: normalizedInvoice.TotalAmount,
            WholeSalerId: normalizedInvoice.WholeSalerId,
            InvoiceType:
              normalizedInvoice.InvoiceType ?? INVOICE_CONSTANT.WHOLESALE,
            WholeSalerName: normalizedInvoice.WholeSalerName,
            CreatedDate: normalizedInvoice.CreatedDate,
          },
          loggedInUser,
        ),
      );
    });
    if (!!dto.ItemId) {
      return await this.getInvoiceByIdResponse(responseCompanies, loggedInUser);
    }
    response.setData(responseCompanies, dataCount);
    response.Summary = this.sanitizeFinancialSummaryForWholesaler(
      await this.getFinancialSummary(mongoQuery),
      loggedInUser,
    );
    return response;
  }

  private async getInvoiceByIdResponse(
    data: any[],
    loggedInUser?: User,
  ): Promise<QueryRespone> {
    const response = new QueryRespone();
    if (data.length !== 1) {
      throw new BadRequestException('Data not found or multiple data exists');
    }
    const invoiceDetails = data[0];
    invoiceDetails.ProductSellInfo = [];
    const datas = await this.productSellModel.find(
      this.getProductSellAccessQuery(loggedInUser, {
        InvoiceId: invoiceDetails.ItemId,
      }),
    );
    datas.forEach((x) => {
      invoiceDetails.ProductSellInfo.push({
        ItemId: x._id,
        InvoiceId: x.InvoiceId,
        CreatedDate: x.CreatedDate,
        SellingPrice: x.SellingPrice,
        ProductId: x.ProductId,
        ProductName: x.ProductName,
        Quantity: x.Quantity,
        WholeSalerId: x.WholeSalerId,
        WholeSalerName: x.WholeSalerName,
      });
    });
    response.setData(
      this.sanitizeInvoiceForWholesaler(invoiceDetails, loggedInUser),
      1,
    );
    return response;
  }

  async deleteInvoiceById(
    id: string,
    loggedInUser?: User,
  ): Promise<CommandResponse> {
    this.authorizeAdmin(loggedInUser);
    return this.runInTransaction(async (session) => {
      const response = new CommandResponse();
      const existingData = await this.invoiceModel
        .findOne({ _id: id })
        .session(session);
      if (!existingData) {
        throw new BadRequestException('Data not found');
      }

      await this.restoreProductSells(id, session);
      await this.productSellModel.deleteMany({ InvoiceId: id }, { session });
      const deleted = await this.invoiceModel.deleteOne(
        { _id: id },
        { session },
      );
      if (deleted.deletedCount !== 1) {
        throw new ConflictException('Invoice changed; refresh and try again');
      }
      return response;
    });
  }

  async updateInvoice(
    dto: UpdateInvoiceDto,
    loggedInUser?: User,
  ): Promise<CommandResponse> {
    this.authorizeAdmin(loggedInUser);
    this.validateInvoiceInput(dto);

    return this.runInTransaction(async (session) => {
      const response = new CommandResponse();
      const existingData = await this.invoiceModel
        .findOne({ _id: dto.ItemId })
        .session(session);
      if (!existingData) {
        throw new BadRequestException('Invoice not found');
      }

      const wholesalerInfo = await this.resolveWholesaler(dto, session);
      await this.restoreProductSells(dto.ItemId, session);
      await this.productSellModel.deleteMany(
        { InvoiceId: dto.ItemId },
        { session },
      );
      const prepared = await this.prepareProductSells(
        dto,
        dto.ItemId,
        wholesalerInfo,
        session,
      );
      if (prepared.sellModels.length > 0) {
        await this.productSellModel.insertMany(prepared.sellModels, {
          session,
        });
      }

      const isDuePaymentInvoice =
        dto.InvoiceType === INVOICE_CONSTANT.DUE_PAYMENT;
      const changed = await this.invoiceModel.updateOne(
        { _id: dto.ItemId },
        {
          $set: {
            TotalAmount: isDuePaymentInvoice
              ? dto.PaymentAmount
              : prepared.totalSellAmount,
            PaymentAmount: dto.PaymentAmount,
            ProductCostAmount: isDuePaymentInvoice
              ? 0
              : prepared.totalCostAmount,
            GrossProfit: isDuePaymentInvoice
              ? 0
              : prepared.totalSellAmount - prepared.totalCostAmount,
            RealizedCashMargin: dto.PaymentAmount - prepared.totalCostAmount,
            InvoiceType: dto.InvoiceType,
            WholeSalerId: dto.WholeSalerId || '',
            WholeSalerName: wholesalerInfo?.DisplayName ?? '',
            IdsAllowedToRead: dto.WholeSalerId ? [dto.WholeSalerId] : [],
          },
        },
        { session, runValidators: true },
      );
      if (changed.matchedCount !== 1) {
        throw new ConflictException('Invoice changed; refresh and try again');
      }
      return response;
    });
  }

  private normalizeInvoiceAmounts<
    T extends Pick<
      Invoice,
      | 'InvoiceType'
      | 'PaymentAmount'
      | 'ProductCostAmount'
      | 'GrossProfit'
      | 'RealizedCashMargin'
      | 'TotalAmount'
    >,
  >(invoice: T): T {
    if (invoice.InvoiceType !== INVOICE_CONSTANT.DUE_PAYMENT) {
      return invoice;
    }

    return {
      ...invoice,
      TotalAmount: invoice.PaymentAmount,
      ProductCostAmount: 0,
      GrossProfit: 0,
      RealizedCashMargin: invoice.PaymentAmount,
    };
  }

  private validateInvoiceInput(dto: CreateInvoiceDto | UpdateInvoiceDto): void {
    const productSellData = dto.ProductSellInfo || [];
    const isDuePaymentInvoice =
      dto.InvoiceType === INVOICE_CONSTANT.DUE_PAYMENT;
    const allowedTypes = Object.values(INVOICE_CONSTANT);

    if (!allowedTypes.includes(dto.InvoiceType)) {
      throw new BadRequestException('Invalid invoice type');
    }
    if (!Number.isFinite(dto.PaymentAmount) || dto.PaymentAmount < 0) {
      throw new BadRequestException('Payment amount must be a finite value');
    }
    if (
      dto.PaymentAmount >
      ORDER_LIMITS.items * ORDER_LIMITS.quantity * ORDER_LIMITS.unitPrice
    ) {
      throw new BadRequestException('Payment amount exceeds the safety limit');
    }
    if (isDuePaymentInvoice && dto.PaymentAmount <= 0) {
      throw new BadRequestException(
        'Due payment amount must be greater than 0',
      );
    }
    if (isDuePaymentInvoice && productSellData.length > 0) {
      throw new BadRequestException(
        'Due payment invoice cannot contain products',
      );
    }
    if (productSellData.length > ORDER_LIMITS.items) {
      throw new BadRequestException('Too many products in one invoice');
    }
    if (!isDuePaymentInvoice && productSellData.length === 0) {
      throw new BadRequestException(
        'At least one product is required for product invoice',
      );
    }
    if (
      (dto.InvoiceType === INVOICE_CONSTANT.WHOLESALE || isDuePaymentInvoice) &&
      !dto.WholeSalerId
    ) {
      throw new BadRequestException('Wholesaler is required for this invoice');
    }
    if (dto.InvoiceType === INVOICE_CONSTANT.CONSUMER && dto.WholeSalerId) {
      throw new BadRequestException(
        'Consumer invoice cannot be assigned to a wholesaler',
      );
    }
    for (const sell of productSellData) {
      if (!sell.ProductId) {
        throw new BadRequestException('Product is required');
      }
      if (
        !Number.isFinite(sell.Quantity) ||
        sell.Quantity <= 0 ||
        sell.Quantity > ORDER_LIMITS.quantity
      ) {
        throw new BadRequestException(
          'Product quantity must be within the allowed range',
        );
      }
      if (
        !Number.isFinite(sell.SellingPrice) ||
        sell.SellingPrice < 0 ||
        sell.SellingPrice > ORDER_LIMITS.unitPrice
      ) {
        throw new BadRequestException(
          'Product selling price must be a finite non-negative value',
        );
      }
    }
  }

  private async resolveWholesaler(
    dto: CreateInvoiceDto | UpdateInvoiceDto,
    session: mongoose.ClientSession,
  ): Promise<User | null> {
    if (!dto.WholeSalerId) return null;
    const wholesalerInfo = await this.userModel
      .findOne({ _id: dto.WholeSalerId })
      .session(session);
    if (
      !wholesalerInfo ||
      !wholesalerInfo.Roles?.includes(UserRoles.WholeSaler) ||
      wholesalerInfo.Active === false
    ) {
      throw new BadRequestException('Wholesaler not found');
    }
    return wholesalerInfo;
  }

  private async prepareProductSells(
    dto: CreateInvoiceDto | UpdateInvoiceDto,
    invoiceId: string,
    wholesalerInfo: User | null,
    session: mongoose.ClientSession,
  ): Promise<{
    sellModels: Record<string, unknown>[];
    totalSellAmount: number;
    totalCostAmount: number;
  }> {
    const sellModels: Record<string, unknown>[] = [];
    const stockRequired = new Map<string, number>();
    let totalSellAmount = 0;
    let totalCostAmount = 0;

    for (const eachSell of dto.ProductSellInfo || []) {
      const productInfo = await this.productModel
        .findOne({ _id: eachSell.ProductId })
        .session(session);
      if (!productInfo) {
        throw new BadRequestException(
          `Product not found: ${eachSell.ProductId}`,
        );
      }
      if (
        !Number.isFinite(productInfo.MakingPrice) ||
        productInfo.MakingPrice < 0
      ) {
        throw new BadRequestException(
          `Product has an invalid making price: ${eachSell.ProductId}`,
        );
      }
      totalSellAmount += eachSell.SellingPrice * eachSell.Quantity;
      totalCostAmount += productInfo.MakingPrice * eachSell.Quantity;
      stockRequired.set(
        eachSell.ProductId,
        (stockRequired.get(eachSell.ProductId) || 0) + eachSell.Quantity,
      );
      sellModels.push({
        _id: this.sharedService.getUid(),
        ProductId: eachSell.ProductId,
        ProductName: productInfo.ProductName,
        SellingPrice: eachSell.SellingPrice,
        MakingPrice: productInfo.MakingPrice,
        Quantity: eachSell.Quantity,
        WholeSalerId: dto.WholeSalerId || '',
        WholeSalerName: wholesalerInfo?.DisplayName ?? '',
        InvoiceId: invoiceId,
        IdsAllowedToRead: dto.WholeSalerId ? [dto.WholeSalerId] : [],
        CreatedDate: new Date().toISOString(),
      });
    }

    if (
      dto.InvoiceType !== INVOICE_CONSTANT.DUE_PAYMENT &&
      dto.PaymentAmount > totalSellAmount
    ) {
      throw new BadRequestException(
        'Payment amount cannot exceed invoice total',
      );
    }

    for (const [productId, quantity] of [...stockRequired].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const changed = await this.productModel.updateOne(
        { _id: productId, Quantity: { $gte: quantity } },
        { $inc: { Quantity: -quantity } },
        { session },
      );
      if (changed.matchedCount !== 1) {
        throw new ConflictException(
          `Insufficient stock or missing product: ${productId}`,
        );
      }
    }

    return { sellModels, totalSellAmount, totalCostAmount };
  }

  private async restoreProductSells(
    invoiceId: string,
    session: mongoose.ClientSession,
  ): Promise<void> {
    const sellProducts = await this.productSellModel
      .find({ InvoiceId: invoiceId })
      .session(session);
    const stockToRestore = new Map<string, number>();
    for (const sell of sellProducts) {
      if (
        !sell.ProductId ||
        !Number.isFinite(sell.Quantity) ||
        sell.Quantity <= 0
      ) {
        throw new ConflictException('Invoice contains invalid product sales');
      }
      stockToRestore.set(
        sell.ProductId,
        (stockToRestore.get(sell.ProductId) || 0) + sell.Quantity,
      );
    }
    for (const [productId, quantity] of [...stockToRestore].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const changed = await this.productModel.updateOne(
        { _id: productId },
        { $inc: { Quantity: quantity } },
        { session },
      );
      if (changed.matchedCount !== 1) {
        throw new ConflictException(`Missing product: ${productId}`);
      }
    }
  }

  private async runInTransaction<T>(
    operation: (session: mongoose.ClientSession) => Promise<T>,
  ): Promise<T> {
    const session = await this.invoiceModel.db.startSession();
    let result: T;
    try {
      await session.withTransaction(async () => {
        result = await operation(session);
      });
      return result!;
    } finally {
      await session.endSession();
    }
  }

  public async getDashboardStatsData(
    loggedInUser?: User,
  ): Promise<QueryRespone> {
    this.authorizeInvoiceRead(loggedInUser);
    const response = new QueryRespone();
    const invoiceFilter = this.getInvoiceAccessQuery(loggedInUser);
    const productSellFilter = this.getProductSellAccessQuery(loggedInUser);
    const start = startOfMonth(new Date());
    const end = startOfMonth(addMonths(start, 1));
    const monthFilter = {
      ...invoiceFilter,
      CreatedDate: { $gte: start.toISOString(), $lt: end.toISOString() },
    };
    const [
      cashMarginData,
      productSalesInfo,
      cashCollectedByWholesaler,
      monthlyFinancials,
      lifetimeFinancials,
      totalInvoices,
      totalSell,
      recentInvoiceDocs,
    ] = await Promise.all([
      this.getCashMarginGroupedByDate(invoiceFilter),
      this.getProductSalesInfo(productSellFilter),
      this.getWholeSalersCashCollected(invoiceFilter),
      this.getFinancialSummary(monthFilter),
      this.getFinancialSummary(invoiceFilter),
      this.invoiceModel.countDocuments(monthFilter),
      this.getThisMonthTotalSold(productSellFilter),
      this.invoiceModel.find(invoiceFilter).sort({ CreatedDate: -1 }).limit(5),
    ]);
    const recentInvoiceData = recentInvoiceDocs.map((invoice) =>
      this.normalizeInvoiceAmounts(invoice.toObject()),
    );
    const consumerData = cashCollectedByWholesaler.find((x) => x.name == '');
    if (consumerData) {
      consumerData.name = 'Consumer';
    }
    const responseData = {
      CashMarginData: cashMarginData,
      ProductSalesInfo: productSalesInfo,
      CashCollectedByWholesaler: cashCollectedByWholesaler,
      ThisMonthCashCollected: monthlyFinancials.CashCollected,
      ThisMonthGrossProfit: monthlyFinancials.GrossProfit,
      ThisMonthRealizedCashMargin: monthlyFinancials.RealizedCashMargin,
      ThisMonthTotalInvoice: totalInvoices,
      ThisMonthTotalSell: totalSell,
      TotalOutstandingDue: lifetimeFinancials.OutstandingDue,
      TotalCustomerCredit: lifetimeFinancials.CustomerCredit,
      TotalCostAtRisk: lifetimeFinancials.CostAtRisk,
      RecentInvoiceData: recentInvoiceData,
    };
    response.setData(
      this.sanitizeDashboardForWholesaler(responseData, loggedInUser),
      0,
    );
    return response;
  }

  async getCashMarginGroupedByDate(
    filter: Record<string, any> = {},
  ): Promise<
    { date: string; cashCollected: number; realizedCashMargin: number }[]
  > {
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
          cashCollected: '$PaymentAmount',
          realizedCashMargin: '$RealizedCashMargin',
        },
      },
      {
        $group: {
          _id: '$date',
          cashCollected: { $sum: '$cashCollected' },
          realizedCashMargin: { $sum: '$realizedCashMargin' },
        },
      },
      {
        $project: {
          _id: 0,
          date: '$_id',
          cashCollected: 1,
          realizedCashMargin: 1,
        },
      },
      {
        $sort: { date: 1 },
      },
    ]);
    return result;
  }

  async getProductSalesInfo(
    filter: Record<string, any> = {},
  ): Promise<{ name: string; sales: number }[]> {
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

  async getWholeSalersCashCollected(
    filter: Record<string, any> = {},
  ): Promise<{ name: string; value: number }[]> {
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
  async getFinancialSummary(
    filter: Record<string, any> = {},
  ): Promise<InvoiceFinancialSummary> {
    const result = await this.invoiceModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          TotalBilled: {
            $sum: {
              $cond: [
                { $eq: ['$InvoiceType', INVOICE_CONSTANT.DUE_PAYMENT] },
                0,
                '$TotalAmount',
              ],
            },
          },
          ProductCostAmount: {
            $sum: {
              $cond: [
                { $eq: ['$InvoiceType', INVOICE_CONSTANT.DUE_PAYMENT] },
                0,
                '$ProductCostAmount',
              ],
            },
          },
          CashCollected: { $sum: '$PaymentAmount' },
          GrossProfit: {
            $sum: {
              $cond: [
                { $eq: ['$InvoiceType', INVOICE_CONSTANT.DUE_PAYMENT] },
                0,
                '$GrossProfit',
              ],
            },
          },
          RealizedCashMargin: { $sum: '$RealizedCashMargin' },
        },
      },
      {
        $project: {
          _id: 0,
          TotalBilled: 1,
          ProductCostAmount: 1,
          CashCollected: 1,
          GrossProfit: 1,
          RealizedCashMargin: 1,
          OutstandingDue: {
            $max: [{ $subtract: ['$TotalBilled', '$CashCollected'] }, 0],
          },
          CustomerCredit: {
            $max: [{ $subtract: ['$CashCollected', '$TotalBilled'] }, 0],
          },
          CostAtRisk: {
            $max: [{ $subtract: ['$ProductCostAmount', '$CashCollected'] }, 0],
          },
        },
      },
    ]);
    return (
      result[0] ?? {
        TotalBilled: 0,
        ProductCostAmount: 0,
        CashCollected: 0,
        GrossProfit: 0,
        RealizedCashMargin: 0,
        OutstandingDue: 0,
        CustomerCredit: 0,
        CostAtRisk: 0,
      }
    );
  }

  async getThisMonthTotalSold(
    filter: Record<string, any> = {},
  ): Promise<number> {
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
    return (await this.getFinancialSummary(filter)).OutstandingDue;
  }
}
