import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';

const SUPPORTED_LANGUAGES = [
  {
    code: 'vi',
    name: 'Vietnamese',
    nativeName: 'Tiếng Việt',
    googleCode: 'vi-VN',
    azureCode: 'vi-VN',
    color: '#8B5CF6',
    flagEmoji: '🇻🇳',
  },
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    googleCode: 'en-US',
    azureCode: 'en-US',
    color: '#3B82F6',
    flagEmoji: '🇺🇸',
  },
  {
    code: 'ja',
    name: 'Japanese',
    nativeName: '日本語',
    googleCode: 'ja-JP',
    azureCode: 'ja-JP',
    color: '#EC4899',
    flagEmoji: '🇯🇵',
  },
  {
    code: 'ko',
    name: 'Korean',
    nativeName: '한국어',
    googleCode: 'ko-KR',
    azureCode: 'ko-KR',
    color: '#10B981',
    flagEmoji: '🇰🇷',
  },
  {
    code: 'zh',
    name: 'Chinese Mandarin',
    nativeName: '中文',
    googleCode: 'zh-CN',
    azureCode: 'zh-CN',
    color: '#F59E0B',
    flagEmoji: '🇨🇳',
  },
];

@Injectable()
export class LanguagesService implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedSupportedLanguages();
  }

  async findAll() {
    const list = await this.prisma.language.findMany({
      where: { isSupported: true },
    });

    const LANGUAGE_ORDER = ['vi', 'en', 'ja', 'ko', 'zh'];
    return list.sort((a, b) => {
      const idxA = LANGUAGE_ORDER.indexOf(a.code);
      const idxB = LANGUAGE_ORDER.indexOf(b.code);
      const orderA = idxA === -1 ? 999 : idxA;
      const orderB = idxB === -1 ? 999 : idxB;
      return orderA - orderB;
    });
  }

  private async seedSupportedLanguages() {
    // 1. Seed/upsert the supported languages
    for (const language of SUPPORTED_LANGUAGES) {
      await this.prisma.language.upsert({
        where: { code: language.code },
        update: {
          name: language.name,
          nativeName: language.nativeName,
          googleCode: language.googleCode,
          azureCode: language.azureCode,
          color: language.color,
          flagEmoji: language.flagEmoji,
          isSupported: true,
        } as any,
        create: {
          ...language,
          isSupported: true,
        } as any,
      });
    }

    // 2. Remove all other languages not in the SUPPORTED_LANGUAGES list
    const allowedCodes = SUPPORTED_LANGUAGES.map((l) => l.code);
    await this.prisma.language.deleteMany({
      where: {
        code: {
          notIn: allowedCodes,
        },
      },
    });
  }
}
