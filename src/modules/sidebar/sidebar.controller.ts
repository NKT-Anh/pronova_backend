import { Controller, Get, UseGuards } from '@nestjs/common';
import { SidebarService } from './sidebar.service';
import { UserOrGuest } from '../../core/decorators/user-or-guest.decorator';
import type { UserOrGuestContext } from '../../core/decorators/user-or-guest.decorator';
import { OptionalJwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('sidebar')
@UseGuards(OptionalJwtAuthGuard)
export class SidebarController {
  constructor(private readonly sidebarService: SidebarService) {}

  @Get()
  getSidebar(@UserOrGuest() owner: UserOrGuestContext) {
    return this.sidebarService.getSidebar(owner);
  }
}
