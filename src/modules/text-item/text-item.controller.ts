import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { TextItemService } from './text-item.service';
import {
  CreateTextItemDto,
  GenerateTextItemSpeechDto,
  UpdateTextItemDto,
} from './dto/text-item.dto';
import { RateLimit } from '../../core/rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../../core/rate-limit/rate-limit.guard';
import { OptionalJwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserOrGuest } from '../../core/decorators/user-or-guest.decorator';
import type { UserOrGuestContext } from '../../core/decorators/user-or-guest.decorator';
import * as express from 'express';

@Controller('text-items')
@UseGuards(OptionalJwtAuthGuard)
export class TextItemController {
  constructor(private readonly textItemService: TextItemService) { }

  @Post()
  create(
    @UserOrGuest() owner: UserOrGuestContext,
    @Body() createTextItemDto: CreateTextItemDto,
  ) {
    return this.textItemService.create(owner, createTextItemDto);
  }

  @Get()
  findAll(
    @UserOrGuest() owner: UserOrGuestContext,
    @Query('folderId') folderId?: string,
  ) {
    return this.textItemService.findAll(owner, folderId);
  }

  @Get('folder/:folderId')
  findAllByFolder(
    @UserOrGuest() owner: UserOrGuestContext,
    @Param('folderId') folderId: string,
  ) {
    return this.textItemService.findAllByFolder(owner, folderId);
  }

  @Get(':id')
  findOne(
    @UserOrGuest() owner: UserOrGuestContext,
    @Param('id') id: string,
  ) {
    return this.textItemService.findOne(owner, id);
  }

  @Post(':id/tts')
  @ApiBearerAuth('jwt')
  @ApiBody({ type: GenerateTextItemSpeechDto })
  @RateLimit({ userLimit: 5, guestLimit: 3, windowMs: 60_000 })
  @UseGuards(RateLimitGuard)
  generateSampleSpeech(
    @UserOrGuest() owner: UserOrGuestContext,
    @Param('id') id: string,
    @Body() dto: GenerateTextItemSpeechDto,
  ) {
    return this.textItemService.generateSampleSpeech(owner, id, dto);
  }

  @Get(':id/sample-audio')
  async getSampleAudio(
    @Param('id') id: string,
    @Res() res: express.Response,
  ) {
    const filePath = await this.textItemService.getSampleAudioPath(id);
    return res.sendFile(filePath);
  }

  @Patch(':id')
  update(
    @UserOrGuest() owner: UserOrGuestContext,
    @Param('id') id: string,
    @Body() updateTextItemDto: UpdateTextItemDto,
  ) {
    return this.textItemService.update(owner, id, updateTextItemDto);
  }

  @Delete(':id')
  remove(
    @UserOrGuest() owner: UserOrGuestContext,
    @Param('id') id: string,
  ) {
    return this.textItemService.remove(owner, id);
  }
}
