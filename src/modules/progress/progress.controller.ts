import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ProgressService } from './progress.service';
import { OptionalJwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserOrGuest } from '../../core/decorators/user-or-guest.decorator';
import type { UserOrGuestContext } from '../../core/decorators/user-or-guest.decorator';

@Controller('progress')
@UseGuards(OptionalJwtAuthGuard)
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  @Get('streak')
  getStreak(@UserOrGuest() owner: UserOrGuestContext) {
    return this.progressService.getStreak(owner);
  }

  @Get('daily')
  getDaily(
    @UserOrGuest() owner: UserOrGuestContext,
    @Query('days') days?: string,
  ) {
    const daysLimit = days ? parseInt(days, 10) : 30;
    return this.progressService.getDailyHistory(owner, daysLimit);
  }
}
