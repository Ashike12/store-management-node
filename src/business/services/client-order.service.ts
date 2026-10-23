import {
  BadRequestException,
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

type MosquitoNetBuilderOptions = {
  leftWidth: number;
  rightWidth: number;
  leftLength: number;
  rightLength: number;
  mosquitoNetYardId: string;
  includeBelowCloth: boolean;
  belowClothId: string;
  includeTopperNet: boolean;
  topperNetYardId: string;
  topperDirection: 'width' | 'length';
  topHeight: number;
  belowHeight: number;
  kuchiStyle: '4side' | 'gap';
  kuchiCount: number;
  kuchiGap: number;
  fitaId: string;
  fitaStyle: string;
  sutarBobinId: string;
};

type MosquitoNetCalculationResult = {
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

  async createOrder(
    dto: CreateClientOrderDto,
    customerIp?: string,
  ): Promise<CommandResponse> {
    const verifiedCaptcha = await this.verifyCaptcha(
      dto.CaptchaToken,
      customerIp,
    );
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
    const orderNumber = `ORD-${Date.now()}`;
    const createdDate = new Date().toISOString();

    await this.orderModel.create({
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

    const response = new CommandResponse();
    response.setSuccess({
      OrderId: orderId,
      OrderNumber: orderNumber,
      TotalAmount: totalAmount,
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
      if (
        item.CustomOptions != null &&
        (typeof item.CustomOptions !== 'object' ||
          Array.isArray(item.CustomOptions) ||
          Object.entries(item.CustomOptions).some(
            ([key, value]) =>
              key.length > 100 ||
              typeof value !== 'string' ||
              value.length > 1000,
          ))
      )
        throw new BadRequestException(
          'Custom options must contain bounded strings',
        );
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
    const serverUnitPrice = Math.ceil(calculated.finalPrice);
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
      CustomOptions: {
        ...calculated.options,
        ServerCalculatedPrice: String(serverUnitPrice),
        ServerCalculatedFitaLengthInch: String(calculated.fitaLengthInInch),
        ServerCalculatedFitaRoll: String(calculated.totalFita),
        ServerCalculatedTopperNetInch: String(calculated.topperNet),
        ServerCalculatedBoundaryNetInch: String(calculated.totalBoundaryNet),
      },
    };
  }

  private async calculateMosquitoNetBuilderPrice(
    options: Record<string, string>,
  ): Promise<MosquitoNetCalculationResult> {
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

    const totalNet =
      builderOptions.leftWidth +
      builderOptions.rightWidth +
      builderOptions.leftLength +
      builderOptions.rightLength;
    const noOfKuchi =
      builderOptions.kuchiStyle === '4side'
        ? builderOptions.kuchiCount * 8
        : Math.floor(totalNet / Math.max(builderOptions.kuchiGap, 1)) + 1;
    const kuchiNet = noOfKuchi * 2;
    const totalBoundaryNet = totalNet + kuchiNet;
    const minimumSide = Math.min(
      builderOptions.leftWidth,
      builderOptions.rightWidth,
      builderOptions.leftLength,
      builderOptions.rightLength,
    );
    const mosquitoNetYardHeightInInch = this.getNetHeight(mosquitoNetYard) * 12;
    this.getNetHeight(topperNet);
    const oppositeSideRun =
      builderOptions.topperDirection === 'width'
        ? Math.max(builderOptions.leftLength, builderOptions.rightLength)
        : Math.max(builderOptions.leftWidth, builderOptions.rightWidth);
    const topperNetInInch =
      Math.ceil(minimumSide / mosquitoNetYardHeightInInch) * oppositeSideRun;
    const topAndBelowHeight =
      builderOptions.topHeight * 2 + builderOptions.belowHeight;
    const belowClothInInch = builderOptions.includeBelowCloth
      ? totalBoundaryNet /
        Math.max(Math.floor(30 / Math.max(topAndBelowHeight, 1)), 1)
      : 0;
    const { widthCount, lengthCount } = this.parseFitaStyle(
      builderOptions.fitaStyle,
    );
    const fitaLengthInInch =
      totalNet +
      widthCount *
        Math.max(builderOptions.leftWidth, builderOptions.rightWidth) +
      lengthCount *
        Math.max(builderOptions.leftLength, builderOptions.rightLength);
    const totalFita = Math.max(Math.ceil(fitaLengthInInch / (12 * 36)), 1);
    const finalPrice =
      (totalBoundaryNet / 36) * this.getEndUserPrice(mosquitoNetYard) +
      (topperNetInInch / 36) * this.getEndUserPrice(topperNet) +
      (belowClothInInch / 36) * this.getEndUserPrice(belowCloth) +
      totalFita * this.getEndUserPrice(fita) +
      this.getEndUserPrice(sutarBobin) +
      200;

    return {
      finalPrice,
      fitaLengthInInch,
      totalFita,
      topperNet: topperNetInInch,
      totalBoundaryNet,
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
