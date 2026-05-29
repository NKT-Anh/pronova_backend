import { Body, Controller, Delete, Get, Headers, Param, Patch, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../core/decorators/current-user.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  findMe(@CurrentUser() user: CurrentUserPayload) {
    return this.userService.findMe(user.id);
  }

  @Patch('me')
  updateMe(
    @CurrentUser() user: CurrentUserPayload,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.userService.updateMe(user.id, updateUserDto);
  }

  @Get('sessions')
  getSessions(
    @CurrentUser() user: CurrentUserPayload,
    @Headers('authorization') authHeader?: string,
  ) {
    const token = authHeader?.replace('Bearer ', '').trim();
    return this.userService.getSessions(user.id, token);
  }

  @Delete('sessions/:id')
  revokeSession(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') sessionId: string,
  ) {
    return this.userService.revokeSession(user.id, sessionId);
  }
}
