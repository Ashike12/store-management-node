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
      if (!Number.isFinite(item.Quantity) || item.Quantity <= 0) {
        throw new BadRequestException(
          `Invalid quantity for product ${item.ProductName}`,
        );
      }

      if (item.ProductId.startsWith('custom-')) {
        return this.normalizeCustomItem(item);
      }

      const product = productsById.get(item.ProductId);
      if (!product) {
        throw new BadRequestException(`Product not found: ${item.ProductName}`);
      }

      const unitPrice =
        product.EndUserDiscountedPrice ||
        product.EndUserPrice ||
        item.UnitPrice;
      return {
        ProductId: item.ProductId,
        ProductName: product.ProductName,
        Category: product.Category,
        SubCategory: product.SubCategory,
        ImageLinks: product.ImageLinks || item.ImageLinks || [],
        UnitPrice: unitPrice,
        Quantity: item.Quantity,
        CustomOptions: item.CustomOptions || {},
      };
      }),
    );

    return normalizedItems;
  }

  private async normalizeCustomItem(item: CreateClientOrderItemDto) {
    const options = item.CustomOptions || {};

    if (
      item.ProductId.startsWith('custom-mosquito-net-') ||
      options.BuildCalculationType === 'MosquitoNet'
    ) {
      const calculated = await this.calculateMosquitoNetBuilderPrice(options);
      const serverUnitPrice = Math.ceil(calculated.finalPrice);

      if (Math.abs(item.UnitPrice - serverUnitPrice) > 1) {
        throw new BadRequestException(
          'Custom mosquito net price validation failed. Please refresh and add it again.',
        );
      }

      return {
        ProductId: item.ProductId,
        ProductName: 'Custom Mosquito Net',
        Category: 'Custom',
        SubCategory: 'Mosquito Net',
        ImageLinks: item.ImageLinks || [],
        UnitPrice: serverUnitPrice,
        Quantity: item.Quantity,
        CustomOptions: {
          ...options,
          ServerCalculatedPrice: String(serverUnitPrice),
          ServerCalculatedFitaLengthInch: String(calculated.fitaLengthInInch),
          ServerCalculatedFitaRoll: String(calculated.totalFita),
          ServerCalculatedTopperNetInch: String(calculated.topperNet),
          ServerCalculatedBoundaryNetInch: String(calculated.totalBoundaryNet),
        },
      };
    }

    if (!Number.isFinite(item.UnitPrice) || item.UnitPrice <= 0) {
      throw new BadRequestException(
        `Invalid custom product price for ${item.ProductName}`,
      );
    }

    return {
      ProductId: item.ProductId,
      ProductName: item.ProductName.trim(),
      Category: item.Category.trim(),
      SubCategory: item.SubCategory.trim(),
      ImageLinks: item.ImageLinks || [],
      UnitPrice: item.UnitPrice,
      Quantity: item.Quantity,
      CustomOptions: options,
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
    const mosquitoNetYardHeightInInch = Math.max(
      this.toNumber(mosquitoNetYard.NetHeight) * 12,
      1,
    );
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
      widthCount * Math.max(builderOptions.leftWidth, builderOptions.rightWidth) +
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
    };
  }

  private parseMosquitoNetBuilderOptions(
    options: Record<string, string>,
  ): MosquitoNetBuilderOptions {
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
      topperDirection: this.getRequiredOption(
        options,
        'TopperDirection',
      ) as 'width' | 'length',
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

    return parsed;
  }

  private getRequiredOption(options: Record<string, string>, key: string) {
    const value = options[key]?.trim();
    if (!value) {
      throw new BadRequestException(`Missing custom option: ${key}`);
    }
    return value;
  }

  private getPositiveOptionNumber(options: Record<string, string>, key: string) {
    const value = this.toNumber(this.getRequiredOption(options, key));
    if (!Number.isFinite(value) || value <= 0) {
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
    return product;
  }

  private parseFitaStyle(style: string) {
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
    return product.EndUserDiscountedPrice || product.EndUserPrice || 0;
  }

  private toNumber(value?: string | number) {
    return Number(value) || 0;
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
