import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../core/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateUserSettingDto } from './dto/update-user-setting.dto';
import { UserSettingsService } from './user-settings.service';

@Controller('user-settings')
@UseGuards(JwtAuthGuard)
export class UserSettingsController {
  constructor(private readonly userSettingsService: UserSettingsService) {}

  @Get('me')
  findMe(@CurrentUser() user: CurrentUserPayload) {
    return this.userSettingsService.findOrCreate(user.id);
  }

  @Patch('me')
  updateMe(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateUserSettingDto,
  ) {
    return this.userSettingsService.update(user.id, dto);
  }
}
