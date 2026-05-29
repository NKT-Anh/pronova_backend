import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { UserOrGuestContext } from '../../core/decorators/user-or-guest.decorator';

@Injectable()
export class SidebarService {
  constructor(private prisma: PrismaService) {}

  async getSidebar(owner: UserOrGuestContext) {
    const where = await this.ownerWhere(owner);

    if (!where) {
      return [];
    }

    return this.prisma.folder.findMany({
      where,
      include: {
        textItems: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async ownerWhere(owner: UserOrGuestContext) {
    if (owner.userId) {
      return { userId: owner.userId };
    }

    if (!owner.guestDeviceId) {
      return null;
    }

    const session = await this.prisma.guestSession.findUnique({
      where: { deviceId: owner.guestDeviceId },
    });

    return session ? { guestId: session.id } : null;
  }
}
