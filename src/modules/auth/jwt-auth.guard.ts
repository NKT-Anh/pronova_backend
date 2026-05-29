import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err, user, info, context) {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers?.authorization;

    if (authHeader && !user) {
      if (err) {
        throw err;
      }

      throw new UnauthorizedException(
        info?.message || 'Invalid authentication token',
      );
    }

    return user || null;
  }
}
