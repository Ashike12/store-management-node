import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SharedService } from '../../services/shared.service';
import { CommandResponse } from '../../shared/response/command.response';
import { QueryRespone } from '../../shared/response/query.response';
import { Product } from '../../shared/schemas/product.schema';
import { ProductReview } from '../../shared/schemas/product-review.schema';
import { User } from '../../shared/schemas/user.schema';
import { UserRoles } from '../../shared/constant/roles.constant';
import {
  CreateProductReviewDto,
  ListProductReviewsDto,
} from '../dto/product/product-review.dto';

@Injectable()
export class ProductReviewService {
  constructor(
    @InjectModel(ProductReview.name)
    private readonly reviews: Model<ProductReview>,
    @InjectModel(Product.name)
    private readonly products: Model<Product>,
    private readonly sharedService: SharedService,
    private readonly config: ConfigService,
  ) {}

  async list(dto: ListProductReviewsDto): Promise<QueryRespone> {
    const filter = { ProductId: dto.ProductId, IsDeleted: false };
    const skip = (dto.Page - 1) * dto.Size;
    const [reviews, totalCount, ratingRows] = await Promise.all([
      this.reviews
        .find(filter)
        .sort({ CreatedDate: -1, _id: -1 })
        .skip(skip)
        .limit(dto.Size)
        .select('_id ReviewerName Rating Comment MediaUrls CreatedDate')
        .lean(),
      this.reviews.countDocuments(filter),
      this.reviews.aggregate([
        { $match: filter },
        { $group: { _id: '$Rating', Count: { $sum: 1 } } },
      ]),
    ]);

    const distribution: Record<number, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };
    for (const row of ratingRows) {
      if (row._id >= 1 && row._id <= 5) distribution[row._id] = row.Count;
    }
    const weightedTotal = Object.entries(distribution).reduce(
      (sum, [rating, count]) => sum + Number(rating) * count,
      0,
    );

    const response = new QueryRespone();
    response.setData(
      reviews.map((review: any) => ({
        ItemId: review._id,
        ReviewerName: review.ReviewerName,
        Rating: review.Rating,
        Comment: review.Comment,
        MediaUrls: this.mediaEnabled() ? (review.MediaUrls ?? []) : [],
        CreatedDate: review.CreatedDate,
      })),
      totalCount,
    );
    response.Summary = {
      AverageRating:
        totalCount > 0 ? Number((weightedTotal / totalCount).toFixed(1)) : 0,
      ReviewCount: totalCount,
      RatingDistribution: distribution,
      MediaEnabled: this.mediaEnabled(),
    };
    return response;
  }

  async create(
    dto: CreateProductReviewDto,
    user: User,
  ): Promise<CommandResponse> {
    if (!user?.Roles?.includes(UserRoles.Customer)) {
      throw new ForbiddenException(
        'A customer account is required to review products',
      );
    }
    if (!(await this.products.exists({ _id: dto.ProductId }))) {
      throw new NotFoundException('Product not found');
    }
    if (
      await this.reviews.exists({
        ProductId: dto.ProductId,
        UserId: String(user._id),
      })
    ) {
      throw new ConflictException('You have already reviewed this product');
    }

    const mediaUrls = dto.MediaUrls ?? [];
    if (mediaUrls.length && !this.mediaEnabled()) {
      throw new BadRequestException('Review media is currently disabled');
    }

    let review: ProductReview;
    try {
      review = await this.reviews.create({
        _id: this.sharedService.getUid(),
        UserId: String(user._id),
        ProductId: dto.ProductId,
        ReviewerName: user.DisplayName,
        Rating: dto.Rating,
        Comment: dto.Comment.trim(),
        MediaUrls: mediaUrls,
        IsDeleted: false,
        CreatedDate: new Date().toISOString(),
      });
    } catch (error) {
      if ((error as any)?.code === 11000) {
        throw new ConflictException('You have already reviewed this product');
      }
      throw error;
    }
    const summary = await this.recalculateProductRating(dto.ProductId);

    const response = new CommandResponse();
    response.setSuccess({
      ItemId: review._id,
      AverageRating: summary.AverageRating,
      ReviewCount: summary.ReviewCount,
    });
    return response;
  }

  private async recalculateProductRating(productId: string) {
    const [summary] = await this.reviews.aggregate([
      { $match: { ProductId: productId, IsDeleted: false } },
      {
        $group: {
          _id: '$ProductId',
          AverageRating: { $avg: '$Rating' },
          ReviewCount: { $sum: 1 },
        },
      },
    ]);
    const result = {
      AverageRating: Number((summary?.AverageRating ?? 0).toFixed(1)),
      ReviewCount: summary?.ReviewCount ?? 0,
    };
    await this.products.updateOne({ _id: productId }, { $set: result });
    return result;
  }

  private mediaEnabled(): boolean {
    return ['true', '1', 'yes'].includes(
      (this.config.get<string>('PRODUCT_REVIEW_MEDIA_ENABLED') ?? '')
        .trim()
        .toLowerCase(),
    );
  }
}
