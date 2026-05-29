import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CreateAttemptDto, QueryAttemptsDto } from './dto/attempt.dto';
import { UserOrGuestContext } from '../../core/decorators/user-or-guest.decorator';

@Injectable()
export class AttemptService {
  constructor(private prisma: PrismaService) {}

  async create(owner: UserOrGuestContext, dto: CreateAttemptDto) {
    await this.findOwnedTextItem(owner, dto.textItemId);
    const guestId = await this.resolveGuestId(owner, true);

    return this.prisma.attempt.create({
      data: {
        textItemId: dto.textItemId,
        userId: owner.userId,
        guestId,
        languageCode: dto.languageCode,
        overallScore: dto.overallScore,
        accuracyScore: dto.accuracyScore,
        fluencyScore: dto.fluencyScore,
        completenessScore: dto.completenessScore,
        prosodyScore: dto.prosodyScore,
        status: dto.status,
        errorMessage: dto.errorMessage,
        audioUrl: dto.audioUrl,
        recognizedText: dto.recognizedText,
        details: dto.details,
        audioDuration: dto.audioDuration,
        audioFormat: dto.audioFormat,
        sampleRate: dto.sampleRate,
        isUsableForAI: dto.isUsableForAI,
      },
    });
  }

  async findAll(owner: UserOrGuestContext, query: QueryAttemptsDto) {
    if (query.textItemId) {
      await this.findOwnedTextItem(owner, query.textItemId);
    }

    const ownerWhere = await this.attemptOwnerWhere(owner);

    if (!ownerWhere) {
      return [];
    }

    return this.prisma.attempt.findMany({
      where: {
        ...ownerWhere,
        textItemId: query.textItemId,
        status: query.status,
        languageCode: query.languageCode,
      },
      orderBy: { createdAt: 'desc' },
      include: { textItem: true },
    });
  }

  async findOne(owner: UserOrGuestContext, id: string) {
    const ownerWhere = await this.attemptOwnerWhere(owner);

    if (!ownerWhere) {
      throw new NotFoundException('Attempt not found');
    }

    const attempt = await this.prisma.attempt.findFirst({
      where: { id, ...ownerWhere },
      include: { textItem: true },
    });

    if (!attempt) {
      throw new NotFoundException('Attempt not found');
    }

    return attempt;
  }

  async findByTextItemId(owner: UserOrGuestContext, textItemId: string) {
    return this.findAll(owner, { textItemId });
  }

  async findOwnedTextItem(owner: UserOrGuestContext, textItemId: string) {
    const textItem = await this.prisma.textItem.findFirst({
      where: {
        id: textItemId,
        folder: await this.folderOwnerWhere(owner),
      },
    });

    if (!textItem) {
      throw new NotFoundException('Text item not found');
    }

    return textItem;
  }

  private async folderOwnerWhere(owner: UserOrGuestContext) {
    if (owner.userId) {
      return { userId: owner.userId };
    }

    const guestId = await this.resolveGuestId(owner, false);

    if (!guestId) {
      throw new NotFoundException('Text item not found');
    }

    return { guestId };
  }

  private async attemptOwnerWhere(owner: UserOrGuestContext) {
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
