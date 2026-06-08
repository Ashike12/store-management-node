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
import { CreateClientOrderDto, CreateClientOrderItemDto } from '../dto/client-order/create-client-order.dto';
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

@Injectable()
export class ClientOrderService {
  constructor(
    private readonly sharedService: SharedService,
    private readonly configService: ConfigService,
    @InjectModel('Order') private readonly orderModel: mongoose.Model<Order>,
    @InjectModel('Product') private readonly productModel: mongoose.Model<Product>,
  ) {}

  async createOrder(dto: CreateClientOrderDto, customerIp?: string): Promise<CommandResponse> {
    const verifiedCaptcha = await this.verifyCaptcha(dto.CaptchaToken, customerIp);
    const normalizedItems = await this.normalizeItems(dto.Items);
    const subtotal = normalizedItems.reduce((sum, item) => sum + item.UnitPrice * item.Quantity, 0);
    const shippingCost = dto.DeliveryZone === 'inside_dhaka' ? 80 : 150;
    const division = dto.DeliveryZone === 'inside_dhaka' ? 'Dhaka' : dto.Division.trim();
    const district = dto.DeliveryZone === 'inside_dhaka' ? 'Dhaka' : dto.District.trim();
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
    const catalogItems = items.filter((item) => !item.ProductId.startsWith('custom-'));
    const catalogIds = catalogItems.map((item) => item.ProductId);
    const products = catalogIds.length
      ? await this.productModel.find({ _id: { $in: catalogIds } })
      : [];
    const productsById = new Map(products.map((product) => [String(product._id), product]));

    return items.map((item) => {
      if (!Number.isFinite(item.Quantity) || item.Quantity <= 0) {
        throw new BadRequestException(`Invalid quantity for product ${item.ProductName}`);
      }

      if (item.ProductId.startsWith('custom-')) {
        return {
          ProductId: item.ProductId,
          ProductName: item.ProductName.trim(),
          Category: item.Category.trim(),
          SubCategory: item.SubCategory.trim(),
          ImageLinks: item.ImageLinks || [],
          UnitPrice: item.UnitPrice,
          Quantity: item.Quantity,
          CustomOptions: item.CustomOptions || {},
        };
      }

      const product = productsById.get(item.ProductId);
      if (!product) {
        throw new BadRequestException(`Product not found: ${item.ProductName}`);
      }

      const unitPrice = product.EndUserDiscountedPrice || product.EndUserPrice || item.UnitPrice;
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
    });
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

  private async verifyCaptcha(token: string, customerIp?: string): Promise<VerifiedCaptcha> {
    const secret = this.configService.get<string>('GOOGLE_RECAPTCHA_SECRET_KEY');
    if (!secret) {
      throw new ServiceUnavailableException('Google reCAPTCHA is not configured');
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
      throw new ServiceUnavailableException('Unable to verify captcha at the moment');
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
