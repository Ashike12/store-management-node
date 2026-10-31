import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { RedisHelperService } from '../services/redis-helper.service';
import { User } from '../shared/schemas/user.schema';

@Injectable()
export class ProductReviewRateLimitGuard implements CanActivate {
  constructor(private readonly redis: RedisHelperService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request['user'] as User | undefined;
    if (!user?._id) throw new UnauthorizedException('Login is required');

    const userId = String(user._id);
    const [minuteCount, hourCount] = await Promise.all([
      this.redis.incrementWithExpiryInSecond(
        `rate-limit:product-review:user:${userId}:minute`,
        60,
      ),
      this.redis.incrementWithExpiryInSecond(
        `rate-limit:product-review:user:${userId}:hour`,
        3600,
      ),
    ]);

    if (minuteCount > 5 || hourCount > 20) {
      throw new HttpException(
        'Too many review attempts. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
