import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CreateFolderDto, UpdateFolderDto } from './dto/folder.dto';
import { UserOrGuestContext } from '../../core/decorators/user-or-guest.decorator';

@Injectable()
export class FolderService {
  constructor(private prisma: PrismaService) {}

  async create(owner: UserOrGuestContext, dto: CreateFolderDto) {
    const guestId = await this.resolveGuestId(owner, true);

    return this.prisma.folder.create({
      data: {
        name: dto.name,
        description: dto.description,
        color: dto.color,
        icon: dto.icon,
        userId: owner.userId,
        guestId,
      },
    });
  }

  async findAll(owner: UserOrGuestContext) {
    const where = await this.ownerWhere(owner);

    if (!where) {
      return [];
    }

    return this.prisma.folder.findMany({
      where,
      include: { textItems: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(owner: UserOrGuestContext, id: string) {
    const folder = await this.findOwnedFolder(owner, id);
    return folder;
  }

  async update(owner: UserOrGuestContext, id: string, dto: UpdateFolderDto) {
    await this.findOwnedFolder(owner, id);

    return this.prisma.folder.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        color: dto.color,
        icon: dto.icon,
      },
    });
  }

  async remove(owner: UserOrGuestContext, id: string) {
    await this.findOwnedFolder(owner, id);

    await this.prisma.folder.delete({
      where: { id },
    });

    return { id };
  }

  private async findOwnedFolder(owner: UserOrGuestContext, id: string) {
    const where = await this.ownerWhere(owner);

    if (!where) {
      throw new NotFoundException('Folder not found');
    }

    const folder = await this.prisma.folder.findFirst({
      where: { id, ...where },
      include: { textItems: true },
    });

    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    return folder;
  }

  private async ownerWhere(owner: UserOrGuestContext) {
    if (owner.userId) {
      return { userId: owner.userId };
    }

    const guestId = await this.resolveGuestId(owner, false);
    return guestId ? { guestId } : null;
  }

  private async resolveGuestId(
    owner: UserOrGuestContext,
    createIfMissing: boolean,
  ) {
    if (owner.userId || !owner.guestDeviceId) {
      return undefined;
    }

    if (createIfMissing) {
      await this.prisma.guestSession.upsert({
        where: { deviceId: owner.guestDeviceId },
        update: {},
        create: { deviceId: owner.guestDeviceId },
      });
    }

    const session = await this.prisma.guestSession.findUnique({
      where: { deviceId: owner.guestDeviceId },
    });

    return session?.id;
  }
}
