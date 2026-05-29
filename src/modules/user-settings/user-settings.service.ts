import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { UpdateUserSettingDto } from './dto/update-user-setting.dto';

@Injectable()
export class UserSettingsService {
  constructor(private prisma: PrismaService) {}

  async findOrCreate(userId: string) {
    return this.prisma.userSetting.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
  }

  async update(userId: string, dto: UpdateUserSettingDto) {
    await this.findOrCreate(userId);

    return this.prisma.userSetting.update({
      where: { userId },
      data: {
        theme: dto.theme,
        language: dto.language,
        dailyGoal: dto.dailyGoal,
        autoPlaySample: dto.autoPlaySample,
        reminderEnabled: dto.reminderEnabled,
        reminderTime: dto.reminderTime,
        allowDataCollection: dto.allowDataCollection,
        nativeLanguage: dto.nativeLanguage,
        ageRange: dto.ageRange,
        gender: dto.gender,
      },
    });
  }
}
