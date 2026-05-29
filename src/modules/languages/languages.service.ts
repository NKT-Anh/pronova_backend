import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';

const SUPPORTED_LANGUAGES = [
  {
    code: 'vi',
    name: 'Vietnamese',
    nativeName: 'Tiếng Việt',
    azureCode: 'vi-VN',
  },
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    azureCode: 'en-US',
  },
  {
    code: 'ja',
    name: 'Japanese',
    nativeName: '日本語',
    azureCode: 'ja-JP',
  },
  {
    code: 'ko',
    name: 'Korean',
    nativeName: '한국어',
    azureCode: 'ko-KR',
  },
  {
    code: 'zh',
    name: 'Chinese',
    nativeName: '中文',
    azureCode: 'zh-CN',
  },
];

@Injectable()
export class LanguagesService implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedSupportedLanguages();
  }

  async findAll() {
    return this.prisma.language.findMany({
      where: { isSupported: true },
      orderBy: { name: 'asc' },
    });
  }

  private async seedSupportedLanguages() {
    for (const language of SUPPORTED_LANGUAGES) {
      await this.prisma.language.upsert({
        where: { code: language.code },
        update: {
          name: language.name,
          nativeName: language.nativeName,
          azureCode: language.azureCode,
          isSupported: true,
        },
        create: {
          ...language,
          isSupported: true,
        },
      });
    }
  }
}
