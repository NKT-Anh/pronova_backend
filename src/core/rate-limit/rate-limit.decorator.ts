import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_METADATA_KEY = 'rateLimit';

export type RateLimitOptions = {
  userLimit: number;
  guestLimit: number;
  windowMs: number;
};

export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_METADATA_KEY, options);
