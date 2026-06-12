import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProcessingStatus, VoiceType } from '@prisma/client';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../../core/prisma/prisma.service';
import {
  CreateTextItemDto,
  GenerateTextItemSpeechDto,
  UpdateTextItemDto,
} from './dto/text-item.dto';
import { UserOrGuestContext } from '../../core/decorators/user-or-guest.decorator';
import { TextToSpeechService } from '../text-to-speech/text-to-speech.service';

@Injectable()
export class TextItemService {
  constructor(
    private prisma: PrismaService,
    private textToSpeechService: TextToSpeechService,
  ) { }

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

  async generateSampleSpeech(
    owner: UserOrGuestContext,
    id: string,
    dto: GenerateTextItemSpeechDto,
  ) {
    const textItem = await this.findOwnedTextItem(owner, id);
    const text = (dto.text || textItem.originalText).trim();

    if (!text) {
      throw new BadRequestException('Text item does not have text for TTS');
    }

    const voiceType = dto.voiceType || textItem.voiceType || VoiceType.FEMALE;
    const voiceName = this.textToSpeechService.resolveVoiceName(
      dto.voiceName,
      voiceType,
    );
    const languageCode = dto.languageCode || textItem.sourceLang;

    const uploadDir = join(process.cwd(), 'uploads', 'text-items');
    const existingFileName = existsSync(uploadDir)
      ? readdirSync(uploadDir).find((name) => name.startsWith(`${textItem.id}-sample.`))
      : undefined;

    const isSameText = text === textItem.originalText.trim();
    const isSameVoice = voiceType === textItem.voiceType;
    const isSameLang = languageCode === textItem.sourceLang;

    if (
      existingFileName &&
      isSameText &&
      isSameVoice &&
      isSameLang
    ) {
      let updatedTextItem = textItem;
      if (textItem.sampleAudioStatus !== ProcessingStatus.COMPLETED || !textItem.sampleAudioUrl) {
        const result = await this.prisma.textItem.update({
          where: { id },
          data: {
            sampleAudioUrl: `/api/text-items/${id}/sample-audio`,
            sampleAudioStatus: ProcessingStatus.COMPLETED,
            sampleAudioError: null,
          },
        });
        updatedTextItem = { ...textItem, ...result };
      }

      const ext = existingFileName.split('.').pop() || 'mp3';
      const mimeType = ext === 'wav' ? 'audio/wav' : 'audio/mpeg';
      return {
        textItem: updatedTextItem,
        sampleAudio: {
          url: updatedTextItem.sampleAudioUrl || `/api/text-items/${id}/sample-audio`,
          mimeType,
          format: ext,
          voiceType: updatedTextItem.voiceType,
          voiceName: updatedTextItem.voiceName,
          languageCode: updatedTextItem.sourceLang,
          provider: updatedTextItem.voiceProvider,
          model: updatedTextItem.voiceProvider === 'google' ? 'google-cloud-tts' : 'gemini',
        },
      };
    }

    await this.prisma.textItem.update({
      where: { id },
      data: {
        sampleAudioStatus: ProcessingStatus.PROCESSING,
        sampleAudioError: null,
        voiceType,
        voiceName,
        voiceProvider: 'google',
      },
    });

    try {
      const audio = await this.textToSpeechService.synthesize({
        text,
        languageCode,
        voiceName,
        voiceType,
      });
      const savedAudio = this.saveTextItemAudioFile(id, audio);
      const updatedTextItem = await this.prisma.textItem.update({
        where: { id },
        data: {
          sampleAudioUrl: savedAudio.url,
          sampleAudioStatus: ProcessingStatus.COMPLETED,
          sampleAudioError: null,
          voiceType,
          voiceName,
          voiceProvider: 'google',
        },
      });

      return {
        textItem: updatedTextItem,
        sampleAudio: {
          url: savedAudio.url,
          mimeType: audio.mimeType,
          format: audio.format,
          voiceType,
          voiceName,
          languageCode,
          provider: audio.provider,
          model: audio.model,
        },
      };
    } catch (error) {
      await this.prisma.textItem.update({
        where: { id },
        data: {
          sampleAudioStatus: ProcessingStatus.FAILED,
          sampleAudioError:
            error instanceof Error ? error.message : 'Failed to generate TTS',
        },
      });
      throw error;
    }
  }

  async getSampleAudioPath(id: string) {
    const textItem = await this.prisma.textItem.findUnique({
      where: { id },
    });

    if (!textItem) {
      throw new NotFoundException('Text item not found');
    }

    if (!textItem.sampleAudioUrl) {
      throw new NotFoundException('Sample audio not found');
    }

    const uploadDir = join(process.cwd(), 'uploads', 'text-items');
    const fileName = existsSync(uploadDir)
      ? readdirSync(uploadDir).find((name) =>
        name.startsWith(`${textItem.id}-sample.`),
      )
      : undefined;

    if (!fileName) {
      throw new NotFoundException('Sample audio file not found');
    }

    const filePath = join(uploadDir, fileName);

    if (!existsSync(filePath)) {
      throw new NotFoundException('Sample audio file not found');
    }

    return filePath;
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

  private saveTextItemAudioFile(
    textItemId: string,
    audio: { buffer: Buffer; format: string },
  ) {
    const uploadDir = join(process.cwd(), 'uploads', 'text-items');

    if (!existsSync(uploadDir)) {
      mkdirSync(uploadDir, { recursive: true });
    }

    const extension = audio.format === 'audio' ? 'wav' : audio.format;
    const fileName = `${textItemId}-sample.${extension}`;
    const filePath = join(uploadDir, fileName);
    writeFileSync(filePath, audio.buffer);

    return {
      filePath,
      url: `/api/text-items/${textItemId}/sample-audio`,
    };
  }
}
