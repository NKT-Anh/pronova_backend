import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  RATE_LIMIT_METADATA_KEY,
  RateLimitOptions,
} from './rate-limit.decorator';

type RateBucket = {
  count: number;
  resetAt: number;
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, RateBucket>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const identity = this.resolveIdentity(request);
    const limit = identity.type === 'guest' ? options.guestLimit : options.userLimit;
    const key = `${request.method}:${request.route?.path || request.path}:${identity.key}`;
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, {
        count: 1,
        resetAt: now + options.windowMs,
      });
      return true;
    }

    if (bucket.count >= limit) {
      const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000);
      throw new HttpException(
        {
          message: 'Too many requests. Please try again later.',
          retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    bucket.count += 1;
    this.cleanupExpiredBuckets(now);
    return true;
  }

  private resolveIdentity(request: Request) {
    const user = request.user as { id?: string; sub?: string } | undefined;

    if (user?.id || user?.sub) {
      return {
        type: 'user' as const,
        key: user.id || user.sub!,
      };
    }

    const guestId = request.header('x-guest-id');

    if (guestId) {
      return {
        type: 'guest' as const,
        key: guestId,
      };
    }

    return {
      type: 'guest' as const,
      key: request.ip || 'unknown',
    };
  }

  private cleanupExpiredBuckets(now: number) {
    if (this.buckets.size < 1000) {
      return;
    }

    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }
  }
}
