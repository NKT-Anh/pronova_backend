import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { UserOrGuestContext } from '../../core/decorators/user-or-guest.decorator';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ProgressService {
  constructor(private prisma: PrismaService) {}

  private async getOwnerFilter(owner: UserOrGuestContext) {
    if (owner.userId) {
      return { userId: owner.userId };
    }

    if (owner.guestDeviceId) {
      const session = await this.prisma.guestSession.findUnique({
        where: { deviceId: owner.guestDeviceId },
      });
      if (session) {
        return { guestId: session.id };
      }
    }

    return null;
  }

  async getStreak(owner: UserOrGuestContext) {
    const filter = await this.getOwnerFilter(owner);
    if (!filter) {
      return {
        currentStreak: 0,
        longestStreak: 0,
        goalMetToday: false,
      };
    }

    // Lấy tất cả attempts
    const attempts = await this.prisma.attempt.findMany({
      where: filter,
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    if (attempts.length === 0) {
      return {
        currentStreak: 0,
        longestStreak: 0,
        goalMetToday: false,
      };
    }

    // Nhóm attempts thành các ngày duy nhất (định dạng YYYY-MM-DD theo giờ UTC)
    const uniqueDates = Array.from(
      new Set(attempts.map((a) => a.createdAt.toISOString().split('T')[0])),
    ).sort((a, b) => b.localeCompare(a)); // Giảm dần

    // Tính toán streak hiện tại và streak dài nhất
    const todayStr = new Date().toISOString().split('T')[0];
    const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    const hasToday = uniqueDates.includes(todayStr);
    const hasYesterday = uniqueDates.includes(yesterdayStr);

    let currentStreak = 0;
    if (hasToday || hasYesterday) {
      let checkDate = hasToday ? new Date(todayStr) : new Date(yesterdayStr);
      while (true) {
        const checkStr = checkDate.toISOString().split('T')[0];
        if (uniqueDates.includes(checkStr)) {
          currentStreak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
      }
    }

    // Tính streak dài nhất (longest streak)
    let longestStreak = 0;
    if (uniqueDates.length > 0) {
      let currentRun = 0;
      let prevDate: Date | null = null;

      // Đi qua từng ngày tăng dần để tìm chuỗi ngày liên tiếp dài nhất
      const ascendingDates = [...uniqueDates].reverse();
      for (const dateStr of ascendingDates) {
        const currentDate = new Date(dateStr);
        if (prevDate === null) {
          currentRun = 1;
        } else {
          const diffTime = Math.abs(currentDate.getTime() - prevDate.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          if (diffDays === 1) {
            currentRun++;
          } else if (diffDays > 1) {
            if (currentRun > longestStreak) {
              longestStreak = currentRun;
            }
            currentRun = 1;
          }
        }
        prevDate = currentDate;
      }
      if (currentRun > longestStreak) {
        longestStreak = currentRun;
      }
    }

    return {
      currentStreak,
      longestStreak: Math.max(longestStreak, currentStreak),
      goalMetToday: hasToday,
    };
  }

  async getDailyHistory(owner: UserOrGuestContext, days = 30) {
    const filter = await this.getOwnerFilter(owner);
    if (!filter) {
      return [];
    }

    // Lấy attempts trong N ngày qua
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const attempts = await this.prisma.attempt.findMany({
      where: {
        ...filter,
        createdAt: { gte: startDate },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Tạo danh sách N ngày qua
    const dailyProgressMap = new Map<string, any>();
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      dailyProgressMap.set(dateStr, {
        id: uuidv4(),
        userId: owner.userId || 'guest',
        date: d.toISOString(),
        attemptsCount: 0,
        minutesPracticed: 0,
        goalMet: false,
        streakDay: 0,
        createdAt: d.toISOString(),
        updatedAt: d.toISOString(),
      });
    }

    // Điền dữ liệu từ attempts vào các ngày tương ứng
    attempts.forEach((attempt) => {
      const dateStr = attempt.createdAt.toISOString().split('T')[0];
      if (dailyProgressMap.has(dateStr)) {
        const dayProgress = dailyProgressMap.get(dateStr);
        dayProgress.attemptsCount += 1;
        // audioDuration tính bằng mili giây, quy ra phút
        dayProgress.minutesPracticed += Math.round((attempt.audioDuration || 0) / 60000);
        dayProgress.goalMet = dayProgress.attemptsCount >= 1;
        dayProgress.updatedAt = attempt.createdAt.toISOString();
      }
    });

    // Trả về danh sách được sắp xếp tăng dần theo thời gian
    return Array.from(dailyProgressMap.values()).reverse();
  }
}
