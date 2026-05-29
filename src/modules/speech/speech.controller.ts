import {
  Body,
  Controller,
  ParseFilePipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes } from '@nestjs/swagger';
import { SpeechService } from './speech.service';
import { OptionalJwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserOrGuest } from '../../core/decorators/user-or-guest.decorator';
import type { UserOrGuestContext } from '../../core/decorators/user-or-guest.decorator';
import { AnalyzeSpeechDto } from './dto/analyze-speech.dto';

@Controller('speech')
@UseGuards(OptionalJwtAuthGuard)
export class SpeechController {
  constructor(private readonly speechService: SpeechService) {}

  @Post('analyze')
  @ApiBearerAuth('jwt')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['textItemId', 'languageCode', 'audio'],
      properties: {
        textItemId: { type: 'string' },
        languageCode: { type: 'string', example: 'en' },
        referenceText: { type: 'string' },
        audio: {
          type: 'string',
          format: 'binary',
          description: 'WAV audio file',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('audio'))
  analyze(
    @UserOrGuest() owner: UserOrGuestContext,
    @Body() dto: AnalyzeSpeechDto,
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: true,
      }),
    )
    audio: Express.Multer.File,
  ) {
    return this.speechService.analyzeAndSave(owner, dto, audio);
  }
}
