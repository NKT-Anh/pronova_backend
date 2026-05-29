import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { SupportService } from './support.service';
import { CreateSupportTicketDto } from './dto/support.dto';
import { OptionalJwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserOrGuest } from '../../core/decorators/user-or-guest.decorator';
import type { UserOrGuestContext } from '../../core/decorators/user-or-guest.decorator';

// ============================================================
// support.controller.ts — Routes /api/support
// ============================================================

@Controller('support')
@UseGuards(OptionalJwtAuthGuard)
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  // POST /api/support/tickets — tạo ticket mới
  @Post('tickets')
  createTicket(
    @UserOrGuest() owner: UserOrGuestContext,
    @Body() dto: CreateSupportTicketDto,
  ) {
    return this.supportService.createTicket(owner, dto);
  }

  // GET /api/support/tickets — lấy danh sách ticket của user đang login
  @Get('tickets')
  getMyTickets(@UserOrGuest() owner: UserOrGuestContext) {
    return this.supportService.getMyTickets(owner);
  }

  // GET /api/support/tickets/:id — xem chi tiết 1 ticket
  @Get('tickets/:id')
  getTicketById(
    @UserOrGuest() owner: UserOrGuestContext,
    @Param('id') id: string,
  ) {
    return this.supportService.getTicketById(owner, id);
  }
}
