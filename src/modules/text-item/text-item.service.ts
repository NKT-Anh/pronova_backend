import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CreateTextItemDto, UpdateTextItemDto } from './dto/text-item.dto';
import { UserOrGuestContext } from '../../core/decorators/user-or-guest.decorator';

@Injectable()
export class TextItemService {
  constructor(private prisma: PrismaService) {}

  async create(owner: UserOrGuestContext, createDto: CreateTextItemDto) {
    await this.findOwnedFolder(owner, createDto.folderId);

    return this.prisma.textItem.create({
      data: {
        folderId: createDto.folderId,
        originalText: createDto.originalText,
        translatedText: createDto.translatedText,
        sourceLang: createDto.sourceLang,
        destLang: createDto.destLang,
        voiceType: createDto.voiceType,
        voiceProvider: createDto.voiceProvider,
        voiceName: createDto.voiceName,
      },
    });
  }

  async findAll(owner: UserOrGuestContext, folderId?: string) {
    if (folderId) {
      await this.findOwnedFolder(owner, folderId);
    }

    return this.prisma.textItem.findMany({
      where: folderId
        ? { folderId }
        : {
            folder: await this.folderOwnerWhere(owner),
          },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAllByFolder(owner: UserOrGuestContext, folderId: string) {
    return this.findAll(owner, folderId);
  }

  async findOne(owner: UserOrGuestContext, id: string) {
    return this.findOwnedTextItem(owner, id);
  }

  async update(owner: UserOrGuestContext, id: string, updateDto: UpdateTextItemDto) {
    await this.findOwnedTextItem(owner, id);

    return this.prisma.textItem.update({
      where: { id },
      data: {
        originalText: updateDto.originalText,
        translatedText: updateDto.translatedText,
        sourceLang: updateDto.sourceLang,
        destLang: updateDto.destLang,
        voiceType: updateDto.voiceType,
        voiceProvider: updateDto.voiceProvider,
        voiceName: updateDto.voiceName,
      },
    });
  }

  async remove(owner: UserOrGuestContext, id: string) {
    await this.findOwnedTextItem(owner, id);

    await this.prisma.textItem.delete({
      where: { id },
    });

    return { id };
  }

  private async findOwnedTextItem(owner: UserOrGuestContext, id: string) {
    const textItem = await this.prisma.textItem.findFirst({
      where: {
        id,
        folder: await this.folderOwnerWhere(owner),
      },
      include: { folder: true },
    });

    if (!textItem) {
      throw new NotFoundException('Text item not found');
    }

    return textItem;
  }

  private async findOwnedFolder(owner: UserOrGuestContext, folderId: string) {
    const folder = await this.prisma.folder.findFirst({
      where: {
        id: folderId,
        ...(await this.folderOwnerWhere(owner)),
      },
    });

    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    return folder;
  }

  private async folderOwnerWhere(owner: UserOrGuestContext) {
    if (owner.userId) {
      return { userId: owner.userId };
    }

    const guestId = await this.resolveGuestId(owner.guestDeviceId);

    if (!guestId) {
      throw new NotFoundException('Folder not found');
    }

    return { guestId };
  }

  private async resolveGuestId(guestDeviceId?: string) {
    if (!guestDeviceId) {
      return undefined;
    }

    const session = await this.prisma.guestSession.findUnique({
      where: { deviceId: guestDeviceId },
    });

    return session?.id;
  }
}
