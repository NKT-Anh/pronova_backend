import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AttemptService } from './attempt.service';
import { CreateAttemptDto, QueryAttemptsDto } from './dto/attempt.dto';
import { OptionalJwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserOrGuest } from '../../core/decorators/user-or-guest.decorator';
import type { UserOrGuestContext } from '../../core/decorators/user-or-guest.decorator';

@Controller('attempts')
@UseGuards(OptionalJwtAuthGuard)
export class AttemptController {
  constructor(private readonly attemptService: AttemptService) {}

  @Post()
  create(
    @UserOrGuest() owner: UserOrGuestContext,
    @Body() createAttemptDto: CreateAttemptDto,
  ) {
    return this.attemptService.create(owner, createAttemptDto);
  }

  @Get()
  findAll(
    @UserOrGuest() owner: UserOrGuestContext,
    @Query() query: QueryAttemptsDto,
  ) {
    return this.attemptService.findAll(owner, query);
  }

  @Get('text-item/:textItemId')
  findByTextItemId(
    @UserOrGuest() owner: UserOrGuestContext,
    @Param('textItemId') textItemId: string,
  ) {
    return this.attemptService.findByTextItemId(owner, textItemId);
  }

  @Get(':id')
  findOne(
    @UserOrGuest() owner: UserOrGuestContext,
    @Param('id') id: string,
  ) {
    return this.attemptService.findOne(owner, id);
  }
}
