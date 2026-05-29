import {
  Body,
  Controller,
  Get,
  Param,
  ParseFilePipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes } from '@nestjs/swagger';
import { UserOrGuest } from '../../core/decorators/user-or-guest.decorator';
import type { UserOrGuestContext } from '../../core/decorators/user-or-guest.decorator';
import { OptionalJwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChatService } from './chat.service';
import { SendTextChatDto, SendVoiceChatDto } from './dto/chat.dto';

@Controller('chat')
@UseGuards(OptionalJwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('text')
  @ApiBearerAuth('jwt')
  sendText(
    @UserOrGuest() owner: UserOrGuestContext,
    @Body() dto: SendTextChatDto,
  ) {
    return this.chatService.sendText(owner, dto);
  }

  @Post('voice')
  @ApiBearerAuth('jwt')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['audio'],
      properties: {
        conversationId: { type: 'string' },
        languageCode: { type: 'string', example: 'en' },
        voice: { type: 'string', example: 'alloy' },
        audio: {
          type: 'string',
          format: 'binary',
          description: 'Audio file: mp3, mp4, mpeg, mpga, m4a, wav, or webm',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: 25 * 1024 * 1024 } }))
  sendVoice(
    @UserOrGuest() owner: UserOrGuestContext,
    @Body() dto: SendVoiceChatDto,
    @UploadedFile(new ParseFilePipe({ fileIsRequired: true }))
    audio: Express.Multer.File,
  ) {
    return this.chatService.sendVoice(owner, dto, audio);
  }

  @Get('conversations')
  findConversations(@UserOrGuest() owner: UserOrGuestContext) {
    return this.chatService.findConversations(owner);
  }

  @Get('conversations/:id')
  findConversation(
    @UserOrGuest() owner: UserOrGuestContext,
    @Param('id') id: string,
  ) {
    return this.chatService.findConversation(owner, id);
  }
}
