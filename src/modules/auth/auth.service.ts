import { ConflictException, Injectable, UnauthorizedException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import axios from 'axios';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { SyncService } from '../sync/sync.service';
import { MailService } from '../support/mail.service';
import { toUserResponse, UserWithSetting } from '../../core/utils/user-response';


@Injectable()
export class AuthService {
  private otpMap = new Map<string, { code: string; expiresAt: Date }>();

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private syncService: SyncService,
    private mailService: MailService,
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

    if (!user.passwordHash) {
      throw new UnauthorizedException('Tài khoản này đăng ký bằng Google. Vui lòng sử dụng Đăng nhập với Google.');
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

  async verifyGoogleToken(token: string): Promise<{ email: string; name?: string; googleId: string }> {
    try {
      const response = await axios.get(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`);
      const data = response.data;

      if (!data.email || !data.sub) {
        throw new UnauthorizedException('Invalid Google ID token structure');
      }

      // Check issuer is google
      if (data.iss !== 'https://accounts.google.com' && data.iss !== 'accounts.google.com') {
        throw new UnauthorizedException('Invalid token issuer');
      }

      return {
        email: data.email,
        name: data.name,
        googleId: data.sub,
      };
    } catch (error) {
      console.error('Google token verification failed:', error.response?.data || error.message);
      throw new UnauthorizedException(
        error.response?.data?.error_description || 'Mã xác thực Google không hợp lệ hoặc đã hết hạn'
      );
    }
  }

  async googleLogin(dto: GoogleLoginDto, userAgent?: string, ipAddress?: string) {
    const { email, name, googleId } = await this.verifyGoogleToken(dto.token);

    // 1. Check if user already exists by email
    let user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: { setting: true },
    });

    if (user) {
      // User exists. Let's make sure googleId is set
      if (!user.googleId) {
        // Link googleId to existing user
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { googleId },
          include: { setting: true },
        });
      }
    } else {
      // User doesn't exist, create a new one
      user = await this.prisma.$transaction(async (tx) => {
        return await tx.user.create({
          data: {
            email: email.trim().toLowerCase(),
            name: name || email.split('@')[0],
            googleId,
            setting: {
              create: {},
            },
          },
          include: { setting: true },
        });
      });
    }

    // 2. Sync guest data if guestId is provided
    if (dto.guestId) {
      try {
        await this.syncService.syncGuestToUser(user.id, dto.guestId);
      } catch (error) {
        console.error('Failed to sync guest data on Google login:', error.message);
      }
    }

    // 3. Build & return auth response
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

  async linkGoogle(userId: string, token: string) {
    const { googleId } = await this.verifyGoogleToken(token);

    // 1. Check if googleId is already linked to another user
    const existingGoogleUser = await this.prisma.user.findUnique({
      where: { googleId },
    });

    if (existingGoogleUser) {
      if (existingGoogleUser.id === userId) {
        return toUserResponse(existingGoogleUser);
      }
      throw new ConflictException('Tài khoản Google này đã được liên kết với một tài khoản khác.');
    }

    // 2. Link googleId to current user
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { googleId },
      include: { setting: true },
    });

    return toUserResponse(updatedUser);
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

  async forgotPassword(dto: ForgotPasswordDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new NotFoundException('Email không tồn tại trong hệ thống');
    }

    // Tạo mã OTP ngẫu nhiên gồm 6 chữ số
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // Có hiệu lực trong 5 phút

    this.otpMap.set(email, { code: otpCode, expiresAt });

    // Gửi email chứa OTP cho người dùng
    try {
      await this.mailService.sendMail({
        to: email,
        subject: '🎙️ Pronova - Mã OTP khôi phục mật khẩu',
        html: this.mailService.buildForgotPasswordOtpHtml({
          email,
          code: otpCode,
        }),
      });
    } catch (error) {
      this.otpMap.delete(email);
      throw new BadRequestException('Không thể gửi email OTP, vui lòng thử lại sau');
    }

    return {
      success: true,
      message: 'Mã OTP đã được gửi về email của bạn',
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const email = dto.email.trim().toLowerCase();
    const otpData = this.otpMap.get(email);

    if (!otpData) {
      throw new BadRequestException('Mã OTP không hợp lệ hoặc đã hết hạn');
    }

    if (otpData.code !== dto.otp.trim()) {
      throw new BadRequestException('Mã OTP không chính xác');
    }

    if (new Date() > otpData.expiresAt) {
      this.otpMap.delete(email);
      throw new BadRequestException('Mã OTP đã hết hạn');
    }

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new NotFoundException('Tài khoản không tồn tại');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.user.update({
      where: { email },
      data: { passwordHash: hashedPassword },
    });

    // Xoá OTP sau khi sử dụng thành công
    this.otpMap.delete(email);

    return {
      success: true,
      message: 'Đặt lại mật khẩu thành công',
    };
  }
}

