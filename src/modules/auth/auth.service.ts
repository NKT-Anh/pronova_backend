import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SyncService } from '../sync/sync.service';
import { toUserResponse, UserWithSetting } from '../../core/utils/user-response';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private syncService: SyncService,
  ) {}

  async register(dto: RegisterDto, userAgent?: string, ipAddress?: string) {
    const email = dto.email.trim().toLowerCase();
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('Email already in use');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email,
          passwordHash: hashedPassword,
          name: dto.name,
          setting: {
            create: {},
          },
        },
        include: { setting: true },
      });

      return createdUser;
    });

    if (dto.guestId) {
      try {
        await this.syncService.syncGuestToUser(user.id, dto.guestId);
      } catch (error) {
        // Log error but don't fail registration
        console.error('Failed to sync guest data:', error.message);
      }
    }

    return await this.buildAuthResponse(user, userAgent, ipAddress);
  }

  async login(dto: LoginDto, userAgent?: string, ipAddress?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
      include: { setting: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (dto.guestId) {
      try {
        await this.syncService.syncGuestToUser(user.id, dto.guestId);
      } catch (error) {
        // Log error but don't fail login
        console.error('Failed to sync guest data on login:', error.message);
      }
    }

    return await this.buildAuthResponse(user, userAgent, ipAddress);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { setting: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return toUserResponse(user);
  }

  private async buildAuthResponse(user: UserWithSetting, userAgent?: string, ipAddress?: string) {
    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    const tokenHash = crypto.createHash('sha256').update(accessToken).digest('hex');

    await this.prisma.userSession.create({
      data: {
        userId: user.id,
        userAgent: userAgent || 'Unknown Device',
        ipAddress: ipAddress || 'Unknown IP',
        tokenHash,
      },
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      user: toUserResponse(user),
    };
  }
}
