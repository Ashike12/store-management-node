import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Type,
  mixin,
} from '@nestjs/common';
import { Request } from 'express';
import { RedisHelperService } from '../services/redis-helper.service';

function getClientIp(request: Request): string {
  const forwardedFor = request.headers['x-forwarded-for'];

  if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
    return forwardedFor.split(',')[0].trim();
  }

  if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
    return forwardedFor[0].split(',')[0].trim();
  }

  return request.ip || request.socket?.remoteAddress || 'unknown-ip';
}

export const RateLimitGuard = (
  duration = 60,
  limit = 10,
): Type<CanActivate> => {
  @Injectable()
  class RateLimitGuardMixin implements CanActivate {
    constructor(private readonly redisHelperService: RedisHelperService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
      const request = context.switchToHttp().getRequest<Request>();
      const route = request.originalUrl.split('?')[0];
      const ip = getClientIp(request);
      const key = `rate-limit:${request.method}:${route}:${ip}`;
      const currentCount =
        await this.redisHelperService.incrementWithExpiryInSecond(
          key,
          duration,
        );

      if (currentCount > limit) {
        throw new HttpException(
          `Too many requests. Please wait ${duration} seconds before trying again.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      return true;
    }
  }

  return mixin(RateLimitGuardMixin);
};
