import { createHash } from 'node:crypto';
import {
  calculateMosquitoNet,
  MosquitoNetBuilderOptions,
  FORMULA_VERSION,
} from '../calculations/mosquito-net';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { CommandResponse } from '../../shared/response/command.response';
import { SharedService } from '../../services/shared.service';
import {
  CreateClientOrderDto,
  CreateClientOrderItemDto,
} from '../dto/client-order/create-client-order.dto';
import { Order } from '../../shared/schemas/order.schema';
import { Product } from '../../shared/schemas/product.schema';
import { UserRoles } from '../../shared/constant/roles.constant';

import {
  ORDER_LIMITS,
  FITA_STYLES,
} from '../../shared/constant/order-validation.constant';
import { PRODUCT_CATEGORY_SUBCATEGORY_MAP } from '../../shared/constant/product.constant';

import { QuoteBuilderDto } from '../dto/client-order/quote-builder.dto';

type CouponType = 'fixed' | 'percent';

const VALID_COUPONS: Record<string, { discount: number; type: CouponType }> = {
  SAVE50: { discount: 50, type: 'fixed' },
  SAVE100: { discount: 100, type: 'fixed' },
  OFF10: { discount: 10, type: 'percent' },
  OFF20: { discount: 20, type: 'percent' },
};

type VerifiedCaptcha = {
  hostname?: string;
};

type MosquitoNetCalculationResult = {
  breakdown: Record<string, number>;
  finalPrice: number;
  fitaLengthInInch: number;
  totalFita: number;
  topperNet: number;
  options: Record<string, string>;
  images: string[];
  totalBoundaryNet: number;
};

@Injectable()
export class ClientOrderService {
  constructor(
    private readonly sharedService: SharedService,
    private readonly configService: ConfigService,
    @InjectModel('Order') private readonly orderModel: mongoose.Model<Order>,
    @InjectModel('Product')
    private readonly productModel: mongoose.Model<Product>,
  ) {}

  async quoteBuilder(dto: QuoteBuilderDto): Promise<CommandResponse> {
    if (dto.BuildType !== 'MosquitoNet')
      throw new BadRequestException('Unsupported custom product type');
    if (
      !Number.isInteger(dto.Quantity) ||
      dto.Quantity < 1 ||
      dto.Quantity > ORDER_LIMITS.quantity
    )
      throw new BadRequestException('Invalid quantity');
    const calculated = await this.calculateMosquitoNetBuilderPrice(
      dto.CustomOptions,
    );
    const unitPrice = this.getCalculatedUnitPrice(calculated);
    const response = new CommandResponse();
    response.setSuccess({
      FormulaVersion: FORMULA_VERSION,
      BuildType: 'MosquitoNet',
      Currency: 'BDT',
      ProductName: 'Custom Mosquito Net',
      Category: 'Custom',
      SubCategory: 'Mosquito Net',
      ImageLinks: calculated.images,
      UnitPrice: unitPrice,
      Quantity: dto.Quantity,
      TotalPrice: unitPrice * dto.Quantity,
      CustomOptions: this.getCalculatedOptions(calculated),
      Breakdown: {
        ...calculated.breakdown,
        UnroundedUnitPrice: calculated.finalPrice,
        RoundingAdjustment: unitPrice - calculated.finalPrice,
      },
    });
    return response;
  }

  private validateOptionStrings(options: Record<string, string>) {
    if (
      !options ||
      typeof options !== 'object' ||
      Array.isArray(options) ||
      Object.keys(options).length > 50 ||
      Object.entries(options).some(
        ([key, value]) =>
          key.length > 100 || typeof value !== 'string' || value.length > 1000,
      )
    )
      throw new BadRequestException(
        'Custom options must contain bounded strings',
      );
    if (
      (options.BuildCalculationType !== undefined &&
        options.BuildCalculationType !== 'MosquitoNet') ||
      (options.BuildType !== undefined && options.BuildType !== 'Mosquito Net')
    )
      throw new BadRequestException('Unsupported custom product type');
  }

  private getCalculatedUnitPrice(calculated: MosquitoNetCalculationResult) {
    const price = Math.ceil(calculated.finalPrice);
    if (!Number.isFinite(price) || price <= 0 || price > ORDER_LIMITS.unitPrice)
      throw new BadRequestException('Invalid calculated price');
    return price;
  }

  private getCalculatedOptions(calculated: MosquitoNetCalculationResult) {
    return {
      ...calculated.options,
      FormulaVersion: FORMULA_VERSION,
      ServerCalculatedPrice: String(this.getCalculatedUnitPrice(calculated)),
      ServerCalculatedFitaLengthInch: String(calculated.fitaLengthInInch),
      ServerCalculatedFitaRoll: String(calculated.totalFita),
      ServerCalculatedTopperNetInch: String(calculated.topperNet),
      ServerCalculatedBoundaryNetInch: String(calculated.totalBoundaryNet),
    };
  }

  async createOrder(
    dto: CreateClientOrderDto,
    customerIp?: string,
  ): Promise<CommandResponse> {
    const verifiedCaptcha = await this.verifyCaptcha(
      dto.CaptchaToken,
      customerIp,
    );
    const { CaptchaToken: _captcha, RequestId: _request, ...payload } = dto;
    const canonical = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(canonical)
        : value && typeof value === 'object'
          ? Object.fromEntries(
              Object.entries(value)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([k, v]) => [k, canonical(v)]),
            )
          : value;
    const requestHash = createHash('sha256')
      .update(JSON.stringify(canonical(payload)))
      .digest('hex');
    const existing = await this.orderModel.findOne({
      RequestId: dto.RequestId,
    });
    if (existing) return this.replayOrder(existing, requestHash);
    const normalizedItems = await this.normalizeItems(dto.Items);
    const subtotal = normalizedItems.reduce(
      (sum, item) => sum + item.UnitPrice * item.Quantity,
      0,
    );
    const shippingCost = dto.DeliveryZone === 'inside_dhaka' ? 80 : 150;
    const division =
      dto.DeliveryZone === 'inside_dhaka' ? 'Dhaka' : dto.Division.trim();
    const district =
      dto.DeliveryZone === 'inside_dhaka' ? 'Dhaka' : dto.District.trim();
    const couponCode = dto.CouponCode?.trim().toUpperCase() || '';
    const couponDiscount = this.getCouponDiscount(couponCode, subtotal);
    const totalAmount = Math.max(subtotal - couponDiscount + shippingCost, 0);
    const orderId = this.sharedService.getUid();
    const orderNumber = `ORD-${orderId}`;
    const createdDate = new Date().toISOString();

    try {
      await this.orderModel.create({
        RequestId: dto.RequestId,
        RequestHash: requestHash,
        FormulaVersion: FORMULA_VERSION,
        Version: 0,
        PaymentStatus: 'unpaid',
        StockDeducted: false,
        StockMovements: [],
        AuditHistory: [
          {
            From: '',
            To: 'pending',
            By: 'storefront',
            At: createdDate,
            Note: 'Order placed',
          },
        ],
        _id: orderId,
        CreatedDate: createdDate,
        RolesAllowedToRead: [UserRoles.Admin],
        RolesAllowedToWrite: [UserRoles.Admin],
        RolesAllowedToUpdate: [UserRoles.Admin],
        RolesAllowedToDelete: [UserRoles.Admin],
        OrderNumber: orderNumber,
        CustomerName: dto.CustomerName.trim(),
        PhoneNumber: dto.PhoneNumber.trim(),
        Division: division,
        District: district,
        Area: dto.Area.trim(),
        PostCode: dto.PostCode.trim(),
        Address: dto.Address.trim(),
        DeliveryNotes: dto.DeliveryNotes?.trim() || '',
        DeliveryZone: dto.DeliveryZone,
        CouponCode: couponCode || '',
        CouponDiscount: couponDiscount,
        ShippingCost: shippingCost,
        Subtotal: subtotal,
        TotalAmount: totalAmount,
        OrderStatus: 'pending',
        Items: normalizedItems,
        CaptchaVerifiedAt: createdDate,
        CaptchaHostname: verifiedCaptcha.hostname || '',
        CustomerIp: customerIp || '',
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const duplicate = await this.orderModel.findOne({
        RequestId: dto.RequestId,
      });
      if (!duplicate) throw error;
      return this.replayOrder(duplicate, requestHash);
    }

    const response = new CommandResponse();
    response.setSuccess({
      OrderId: orderId,
      OrderNumber: orderNumber,
      TotalAmount: totalAmount,
    });
    return response;
  }

  private replayOrder(order: Order, hash: string) {
    if (order.RequestHash !== hash)
      throw new ConflictException(
        'RequestId already used for a different order',
      );
    const response = new CommandResponse();
    response.setSuccess({
      OrderId: order._id,
      OrderNumber: order.OrderNumber,
      TotalAmount: order.TotalAmount,
    });
    return response;
  }

  private async normalizeItems(items: CreateClientOrderItemDto[]) {
    if (
      !Array.isArray(items) ||
      !items.length ||
      items.length > ORDER_LIMITS.items
    ) {
      throw new BadRequestException('Invalid order items');
    }
    for (const item of items) {
      if (!item || typeof item.ProductId !== 'string' || !item.ProductId.trim())
        throw new BadRequestException('Invalid product ID');
      if (
        !Number.isInteger(item.Quantity) ||
        item.Quantity < 1 ||
        item.Quantity > ORDER_LIMITS.quantity
      )
        throw new BadRequestException('Invalid quantity');
      if (
        typeof item.UnitPrice !== 'number' ||
        !Number.isFinite(item.UnitPrice) ||
        item.UnitPrice <= 0 ||
        item.UnitPrice > ORDER_LIMITS.unitPrice
      )
        throw new BadRequestException('Invalid submitted price');
      this.validateOptionStrings(item.CustomOptions ?? {});
    }
    const catalogItems = items.filter(
      (item) => !item.ProductId.startsWith('custom-'),
    );
    const catalogIds = catalogItems.map((item) => item.ProductId);
    const products = catalogIds.length
      ? await this.productModel.find({ _id: { $in: catalogIds } })
      : [];
    const productsById = new Map(
      products.map((product) => [String(product._id), product]),
    );

    const normalizedItems = await Promise.all(
      items.map(async (item) => {
        if (item.ProductId.startsWith('custom-')) {
          return this.normalizeCustomItem(item);
        }

        const product = productsById.get(item.ProductId);
        if (!product) {
          throw new BadRequestException(
            `Product not found: ${item.ProductName}`,
          );
        }

        const unitPrice = this.getEndUserPrice(product);
        return {
          ProductId: item.ProductId,
          ProductName: product.ProductName,
          Category: product.Category,
          SubCategory: product.SubCategory,
          ImageLinks: product.ImageLinks || [],
          UnitPrice: unitPrice,
          Quantity: item.Quantity,
          CustomOptions: {},
          InventoryRequirements: [
            { ProductId: item.ProductId, Quantity: item.Quantity },
          ],
        };
      }),
    );

    return normalizedItems;
  }

  private async normalizeCustomItem(item: CreateClientOrderItemDto) {
    const options = item.CustomOptions || {};
    if (
      !item.ProductId.startsWith('custom-mosquito-net-') ||
      (options.BuildCalculationType !== undefined &&
        options.BuildCalculationType !== 'MosquitoNet') ||
      (options.BuildType !== undefined && options.BuildType !== 'Mosquito Net')
    ) {
      throw new BadRequestException('Unsupported custom product type');
    }
    const calculated = await this.calculateMosquitoNetBuilderPrice(options);
    const serverUnitPrice = this.getCalculatedUnitPrice(calculated);
    if (
      !Number.isFinite(serverUnitPrice) ||
      serverUnitPrice <= 0 ||
      serverUnitPrice > ORDER_LIMITS.unitPrice ||
      item.UnitPrice !== serverUnitPrice
    ) {
      throw new BadRequestException(
        'Custom mosquito net price validation failed. Please refresh and add it again.',
      );
    }
    return {
      ProductId: item.ProductId,
      ProductName: 'Custom Mosquito Net',
      Category: 'Custom',
      SubCategory: 'Mosquito Net',
      ImageLinks: calculated.images,
      UnitPrice: serverUnitPrice,
      Quantity: item.Quantity,
      CustomOptions: this.getCalculatedOptions(calculated),
      InventoryRequirements: this.builderInventory(calculated, item.Quantity),
    };
  }

  private builderInventory(
    calculated: MosquitoNetCalculationResult,
    quantity: number,
  ) {
    const o = calculated.options;
    return [
      {
        ProductId: o.MosquitoNetYardId,
        Quantity: (calculated.totalBoundaryNet / 36) * quantity,
      },
      {
        ProductId: o.TopperNetYardId,
        Quantity: (calculated.topperNet / 36) * quantity,
      },
      ...(o.IncludeBelowCloth === 'true'
        ? [
            {
              ProductId: o.BelowClothId,
              Quantity: (calculated.breakdown.BelowClothInch / 36) * quantity,
            },
          ]
        : []),
      { ProductId: o.FitaId, Quantity: calculated.totalFita * quantity },
      { ProductId: o.SutarBobinId, Quantity: quantity },
    ];
  }

  private async calculateMosquitoNetBuilderPrice(
    options: Record<string, string>,
  ): Promise<MosquitoNetCalculationResult> {
    this.validateOptionStrings(options);
    const builderOptions = this.parseMosquitoNetBuilderOptions(options);
    const products = await this.productModel.find({
      _id: {
        $in: [
          builderOptions.mosquitoNetYardId,
          builderOptions.includeTopperNet
            ? builderOptions.topperNetYardId
            : builderOptions.mosquitoNetYardId,
          ...(builderOptions.includeBelowCloth
            ? [builderOptions.belowClothId]
            : []),
          builderOptions.fitaId,
          builderOptions.sutarBobinId,
        ],
      },
    });
    const productsById = new Map(
      products.map((product) => [String(product._id), product]),
    );
    const mosquitoNetYard = this.requireBuilderProduct(
      productsById,
      builderOptions.mosquitoNetYardId,
      'Mosquito net yard',
    );
    const topperNet = this.requireBuilderProduct(
      productsById,
      builderOptions.includeTopperNet
        ? builderOptions.topperNetYardId
        : builderOptions.mosquitoNetYardId,
      'Topper net',
    );
    const belowCloth = builderOptions.includeBelowCloth
      ? this.requireBuilderProduct(
          productsById,
          builderOptions.belowClothId,
          'Mosquito net below cloth',
        )
      : undefined;
    const fita = this.requireBuilderProduct(
      productsById,
      builderOptions.fitaId,
      'Fita',
    );
    const sutarBobin = this.requireBuilderProduct(
      productsById,
      builderOptions.sutarBobinId,
      'Sutar bobin',
    );

    this.getNetHeight(topperNet);
    const calculation = calculateMosquitoNet(
      builderOptions,
      this.getNetHeight(mosquitoNetYard),
      {
        yard: this.getEndUserPrice(mosquitoNetYard),
        topper: this.getEndUserPrice(topperNet),
        cloth: this.getEndUserPrice(belowCloth),
        fita: this.getEndUserPrice(fita),
        thread: this.getEndUserPrice(sutarBobin),
      },
    );
    return {
      ...calculation,
      images: mosquitoNetYard.ImageLinks || [],
      options: {
        BuildCalculationType: 'MosquitoNet',
        BuildType: 'Mosquito Net',
        LeftWidthInch: String(builderOptions.leftWidth),
        RightWidthInch: String(builderOptions.rightWidth),
        LeftLengthInch: String(builderOptions.leftLength),
        RightLengthInch: String(builderOptions.rightLength),
        MosquitoNetYardId: builderOptions.mosquitoNetYardId,
        IncludeBelowCloth: String(builderOptions.includeBelowCloth),
        BelowClothId: builderOptions.includeBelowCloth
          ? builderOptions.belowClothId
          : '',
        IncludeTopperNet: String(builderOptions.includeTopperNet),
        TopperNetYardId: builderOptions.includeTopperNet
          ? builderOptions.topperNetYardId
          : builderOptions.mosquitoNetYardId,
        TopperDirection: builderOptions.topperDirection,
        TopHeightInch: String(builderOptions.topHeight),
        BelowHeightInch: String(builderOptions.belowHeight),
        KuchiStyle: builderOptions.kuchiStyle,
        KuchiCount: String(builderOptions.kuchiCount),
        KuchiGapInch: String(builderOptions.kuchiGap),
        FitaId: builderOptions.fitaId,
        FitaStyle: builderOptions.fitaStyle,
        SutarBobinId: builderOptions.sutarBobinId,
        LeftWidth: builderOptions.leftWidth + ' inch',
        RightWidth: builderOptions.rightWidth + ' inch',
        LeftLength: builderOptions.leftLength + ' inch',
        RightLength: builderOptions.rightLength + ' inch',
        MosquitoNetYard: mosquitoNetYard.ProductName || '',
        TopperNet: topperNet.ProductName || '',
        BelowCloth: belowCloth?.ProductName || 'No',
      },
    };
  }

  private parseMosquitoNetBuilderOptions(
    options: Record<string, string>,
  ): MosquitoNetBuilderOptions {
    for (const key of ['IncludeBelowCloth', 'IncludeTopperNet']) {
      if (!['true', 'false'].includes(options[key]))
        throw new BadRequestException('Invalid boolean option: ' + key);
    }
    const parsed = {
      leftWidth: this.getPositiveOptionNumber(options, 'LeftWidthInch'),
      rightWidth: this.getPositiveOptionNumber(options, 'RightWidthInch'),
      leftLength: this.getPositiveOptionNumber(options, 'LeftLengthInch'),
      rightLength: this.getPositiveOptionNumber(options, 'RightLengthInch'),
      mosquitoNetYardId: this.getRequiredOption(options, 'MosquitoNetYardId'),
      includeBelowCloth: options.IncludeBelowCloth === 'true',
      belowClothId: options.BelowClothId || '',
      includeTopperNet: options.IncludeTopperNet === 'true',
      topperNetYardId: options.TopperNetYardId || '',
      topperDirection: this.getRequiredOption(options, 'TopperDirection') as
        | 'width'
        | 'length',
      topHeight: this.getPositiveOptionNumber(options, 'TopHeightInch'),
      belowHeight: this.getPositiveOptionNumber(options, 'BelowHeightInch'),
      kuchiStyle: this.getRequiredOption(options, 'KuchiStyle') as
        | '4side'
        | 'gap',
      kuchiCount: this.getPositiveOptionNumber(options, 'KuchiCount'),
      kuchiGap: this.getPositiveOptionNumber(options, 'KuchiGapInch'),
      fitaId: this.getRequiredOption(options, 'FitaId'),
      fitaStyle: this.getRequiredOption(options, 'FitaStyle'),
      sutarBobinId: this.getRequiredOption(options, 'SutarBobinId'),
    };

    if (!['width', 'length'].includes(parsed.topperDirection)) {
      throw new BadRequestException('Invalid topper direction');
    }
    if (!['4side', 'gap'].includes(parsed.kuchiStyle)) {
      throw new BadRequestException('Invalid kuchi style');
    }
    if (parsed.includeBelowCloth && !parsed.belowClothId) {
      throw new BadRequestException('Below cloth is required');
    }
    if (parsed.includeTopperNet && !parsed.topperNetYardId) {
      throw new BadRequestException('Topper net is required');
    }

    if (
      !Number.isInteger(parsed.kuchiCount) ||
      parsed.kuchiCount < 4 ||
      parsed.kuchiCount > 10
    )
      throw new BadRequestException('Kuchi count must be 4 to 10');
    if (
      !Number.isInteger(parsed.kuchiGap) ||
      parsed.kuchiGap < 2 ||
      parsed.kuchiGap > 12
    )
      throw new BadRequestException('Kuchi gap must be 2 to 12 inches');
    this.parseFitaStyle(parsed.fitaStyle);
    return parsed;
  }

  private getRequiredOption(options: Record<string, string>, key: string) {
    if (typeof options[key] !== 'string')
      throw new BadRequestException('Invalid custom option: ' + key);
    const value = options[key].trim();
    if (!value) {
      throw new BadRequestException(`Missing custom option: ${key}`);
    }
    return value;
  }

  private getPositiveOptionNumber(
    options: Record<string, string>,
    key: string,
  ) {
    const text = this.getRequiredOption(options, key);
    if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(text))
      throw new BadRequestException('Invalid numeric option: ' + key);
    const value = Number(text);
    if (
      !Number.isFinite(value) ||
      value < 1 ||
      value > ORDER_LIMITS.measurementInches
    ) {
      throw new BadRequestException(`Invalid custom option: ${key}`);
    }
    return value;
  }

  private requireBuilderProduct(
    productsById: Map<string, Product>,
    productId: string,
    label: string,
  ) {
    const product = productsById.get(productId);
    if (!product) {
      throw new BadRequestException(`${label} product not found`);
    }
    const subcategories: Record<string, string> = {
      'Mosquito net below cloth': 'MosquitoNetBelowCloth',
      Fita: 'Fita',
      'Sutar bobin': 'SutarBobin',
    };
    const subcategory = subcategories[label];
    if (
      subcategory
        ? product.Category !== 'Others' || product.SubCategory !== subcategory
        : product.Category !== 'MosquitoNetYard' ||
          !PRODUCT_CATEGORY_SUBCATEGORY_MAP.MosquitoNetYard.includes(
            product.SubCategory,
          )
    ) {
      throw new BadRequestException('Invalid material category for ' + label);
    }
    this.getEndUserPrice(product);
    return product;
  }

  private parseFitaStyle(style: string) {
    if (!FITA_STYLES.includes(style))
      throw new BadRequestException('Invalid fita style');
    const [widthCount, lengthCount] = style.split(':').map(Number);
    if (
      !Number.isFinite(widthCount) ||
      widthCount <= 0 ||
      !Number.isFinite(lengthCount) ||
      lengthCount <= 0
    ) {
      throw new BadRequestException('Invalid fita style');
    }
    return { widthCount, lengthCount };
  }

  private getEndUserPrice(product?: Product) {
    if (!product) {
      return 0;
    }
    const price = product.EndUserDiscountedPrice ?? product.EndUserPrice;
    if (
      typeof price !== 'number' ||
      !Number.isFinite(price) ||
      price <= 0 ||
      price > ORDER_LIMITS.unitPrice
    )
      throw new BadRequestException('Invalid database product price');
    return price;
  }

  private getNetHeight(product: Product): number {
    const raw = product.NetHeight;
    if (
      typeof raw !== 'string' ||
      !/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(raw.trim())
    )
      throw new BadRequestException('Invalid database net height');
    const height = Number(raw);
    if (
      !Number.isFinite(height) ||
      height <= 0 ||
      height * 12 > ORDER_LIMITS.measurementInches
    )
      throw new BadRequestException('Invalid database net height');
    return height;
  }

  private getCouponDiscount(couponCode: string, subtotal: number) {
    if (!couponCode) {
      return 0;
    }

    const coupon = VALID_COUPONS[couponCode];
    if (!coupon) {
      return 0;
    }

    if (coupon.type === 'percent') {
      return (subtotal * coupon.discount) / 100;
    }

    return coupon.discount;
  }

  private async verifyCaptcha(
    token: string,
    customerIp?: string,
  ): Promise<VerifiedCaptcha> {
    const secret = this.configService.get<string>(
      'GOOGLE_RECAPTCHA_SECRET_KEY',
    );
    if (!secret) {
      throw new ServiceUnavailableException(
        'Google reCAPTCHA is not configured',
      );
    }

    const verifyUrl =
      this.configService.get<string>('GOOGLE_RECAPTCHA_VERIFY_URL') ||
      'https://www.google.com/recaptcha/api/siteverify';

    const body = new URLSearchParams({
      secret,
      response: token,
    });

    if (customerIp) {
      body.append('remoteip', customerIp);
    }

    const captchaResponse = await fetch(verifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!captchaResponse.ok) {
      throw new ServiceUnavailableException(
        'Unable to verify captcha at the moment',
      );
    }

    const data = (await captchaResponse.json()) as {
      success?: boolean;
      hostname?: string;
    };

    if (!data.success) {
      throw new BadRequestException('Captcha verification failed');
    }

    return {
      hostname: data.hostname,
    };
  }
}
