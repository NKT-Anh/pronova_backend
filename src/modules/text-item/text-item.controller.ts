import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { TextItemService } from './text-item.service';
import { CreateTextItemDto, UpdateTextItemDto } from './dto/text-item.dto';
import { OptionalJwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserOrGuest } from '../../core/decorators/user-or-guest.decorator';
import type { UserOrGuestContext } from '../../core/decorators/user-or-guest.decorator';

@Controller('text-items')
@UseGuards(OptionalJwtAuthGuard)
export class TextItemController {
  constructor(private readonly textItemService: TextItemService) {}

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
