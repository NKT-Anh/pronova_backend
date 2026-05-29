import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { FolderService } from './folder.service';
import { CreateFolderDto, UpdateFolderDto } from './dto/folder.dto';
import { OptionalJwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserOrGuest } from '../../core/decorators/user-or-guest.decorator';
import type { UserOrGuestContext } from '../../core/decorators/user-or-guest.decorator';
import { TextItemService } from '../text-item/text-item.service';

@Controller('folders')
@UseGuards(OptionalJwtAuthGuard)
export class FolderController {
  constructor(
    private readonly folderService: FolderService,
    private readonly textItemService: TextItemService,
  ) {}

  @Post()
  create(
    @UserOrGuest() owner: UserOrGuestContext,
    @Body() createFolderDto: CreateFolderDto,
  ) {
    return this.folderService.create(owner, createFolderDto);
  }

  @Get()
  findAll(@UserOrGuest() owner: UserOrGuestContext) {
    return this.folderService.findAll(owner);
  }

  /// GET /folders/:folderId/text-items — RESTful route cho Flutter
  @Get(':folderId/text-items')
  findTextItems(
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
    return this.folderService.findOne(owner, id);
  }

  @Patch(':id')
  update(
    @UserOrGuest() owner: UserOrGuestContext,
    @Param('id') id: string,
    @Body() updateFolderDto: UpdateFolderDto,
  ) {
    return this.folderService.update(owner, id, updateFolderDto);
  }

  @Delete(':id')
  remove(
    @UserOrGuest() owner: UserOrGuestContext,
    @Param('id') id: string,
  ) {
    return this.folderService.remove(owner, id);
  }
}
