import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { toUserResponse } from '../../core/utils/user-response';
import { UpdateUserDto } from './dto/update-user.dto';
import * as crypto from 'crypto';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async findMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { setting: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return toUserResponse(user);
  }

  async updateMe(userId: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: dto.name,
      },
      include: { setting: true },
    });

    return toUserResponse(user);
  }

  async getSessions(userId: string, currentToken?: string) {
    const currentTokenHash = currentToken
      ? crypto.createHash('sha256').update(currentToken).digest('hex')
      : null;

    const sessions = await this.prisma.userSession.findMany({
      where: { userId, isActive: true },
      orderBy: { lastActiveAt: 'desc' },
    });

    return sessions.map((session) => ({
      id: session.id,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      lastActiveAt: session.lastActiveAt,
      createdAt: session.createdAt,
      isCurrent: currentTokenHash ? session.tokenHash === currentTokenHash : false,
    }));
  }

  async revokeSession(userId: string, sessionId: string) {
    const session = await this.prisma.userSession.findFirst({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw new NotFoundException('Session not found or does not belong to you');
    }

    await this.prisma.userSession.delete({
      where: { id: sessionId },
    });

    return { success: true };
  }
}
