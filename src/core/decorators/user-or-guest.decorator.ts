import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';

export interface UserOrGuestContext {
  userId?: string;
  guestDeviceId?: string;
}

export const UserOrGuest = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): UserOrGuestContext => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    const guestDeviceId =
      (request.headers['x-guest-id'] as string | undefined) ||
      request.body?.guestId ||
      request.query?.guestId;

    if (!user && !guestDeviceId) {
      throw new UnauthorizedException('Must provide authentication token or x-guest-id header');
    }

    return {
      userId: user?.id,
      guestDeviceId: !user ? guestDeviceId : undefined,
    };
  },
);
