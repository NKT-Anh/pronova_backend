import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';

@Injectable()
export class SyncService {
  constructor(private prisma: PrismaService) {}

  async syncGuestToUser(userId: string, guestDeviceId: string) {
    const guestSession = await this.prisma.guestSession.findUnique({
      where: { deviceId: guestDeviceId },
    });

    if (!guestSession) {
      throw new BadRequestException('Guest session not found');
    }

    const guestId = guestSession.id;

    return this.prisma.$transaction(async (tx) => {
      // 1. Reassign folders
      await tx.folder.updateMany({
        where: { guestId },
        data: { guestId: null, userId },
      });

      // 2. Reassign attempts
      await tx.attempt.updateMany({
        where: { guestId },
        data: { guestId: null, userId },
      });

      // 3. Delete guest session
      await tx.guestSession.delete({
        where: { id: guestId },
      });

      return { success: true, message: 'Data synced successfully' };
    });
  }
}
