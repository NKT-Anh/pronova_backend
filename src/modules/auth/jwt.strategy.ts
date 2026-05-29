import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { UserRole } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../core/prisma/prisma.service';
import { toUserResponse } from '../../core/utils/user-response';
import * as crypto from 'crypto';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private prisma: PrismaService,
    configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'super-secret',
      passReqToCallback: true,
    });
  }

  async validate(req: any, payload: { sub: string; email: string; role: UserRole }) {
    const authHeader = req.headers?.authorization;
    const token = authHeader?.replace('Bearer ', '').trim();
    
    if (!token) {
      throw new UnauthorizedException('Token not found in request');
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const session = await this.prisma.userSession.findUnique({
      where: { tokenHash },
    });

    if (!session || !session.isActive) {
      throw new UnauthorizedException('Session is invalid or has been revoked');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Update lastActiveAt periodically / on access
    await this.prisma.userSession.update({
      where: { id: session.id },
      data: { lastActiveAt: new Date() },
    }).catch((err) => {
      console.error('Failed to update session lastActiveAt:', err.message);
    });

    return toUserResponse(user);
  }
}
