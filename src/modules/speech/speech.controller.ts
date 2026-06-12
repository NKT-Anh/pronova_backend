import {
  Body,
  Controller,
  Get,
  Param,
  ParseFilePipe,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes } from '@nestjs/swagger';
import { SpeechService } from './speech.service';
import { OptionalJwtAuthGuard } from '../auth/jwt-auth.guard';
import { RateLimit } from '../../core/rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../../core/rate-limit/rate-limit.guard';
import { MAX_AUDIO_UPLOAD_BYTES } from '../../core/upload/audio-upload.constants';
import { UserOrGuest } from '../../core/decorators/user-or-guest.decorator';
import type { UserOrGuestContext } from '../../core/decorators/user-or-guest.decorator';
import { AnalyzeSpeechDto } from './dto/analyze-speech.dto';
import { AnalyzeSpeechFreeDto } from './dto/analyze-speech-free.dto';
import { ScoreAttemptDto } from './dto/score-attempt.dto';
import { TranscribeSpeechDto } from './dto/transcribe-speech.dto';
import * as express from 'express';

@Controller('speech')
@UseGuards(OptionalJwtAuthGuard)
export class SpeechController {
  constructor(private readonly speechService: SpeechService) {}

  @Get('attempts/:attemptId/audio')
  async getAttemptAudio(
    @Param('attemptId') attemptId: string,
    @Res() res: express.Response,
  ) {
    const filePath = await this.speechService.getAttemptAudioPath(attemptId);
    return res.sendFile(filePath);
  }

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
        assessmentProvider: {
          type: 'string',
          enum: ['WHISPER_TEXT', 'GOOGLE_STT_TEXT'],
          description:
            'Optional assessment provider. GOPT has been removed.',
        },
        audio: {
          type: 'string',
          format: 'binary',
          description: 'WAV audio file',
        },
      },
    },
  })
  @RateLimit({ userLimit: 5, guestLimit: 3, windowMs: 60_000 })
  @UseGuards(RateLimitGuard)
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: MAX_AUDIO_UPLOAD_BYTES } }))
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

  @Post('analyze-free')
  @ApiBearerAuth('jwt')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['languageCode', 'audio'],
      properties: {
        languageCode: { type: 'string', example: 'en' },
        topic: {
          type: 'string',
          example: 'Talk about your favorite hobby',
          description: 'Optional speaking topic. Defaults to free speaking.',
        },
        audio: {
          type: 'string',
          format: 'binary',
          description: 'Audio file',
        },
      },
    },
  })
  @RateLimit({ userLimit: 5, guestLimit: 3, windowMs: 60_000 })
  @UseGuards(RateLimitGuard)
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: MAX_AUDIO_UPLOAD_BYTES } }))
  analyzeFree(
    @UserOrGuest() owner: UserOrGuestContext,
    @Body() dto: AnalyzeSpeechFreeDto,
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: true,
      }),
    )
    audio: Express.Multer.File,
  ) {
    return this.speechService.analyzeFree(owner, dto, audio);
  }

  @Post('transcribe')
  @ApiBearerAuth('jwt')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['languageCode', 'audio'],
      properties: {
        languageCode: { type: 'string', example: 'en' },
        folderId: {
          type: 'string',
          description: 'Optional target folder. If omitted, backend uses free speaking folder.',
        },
        audio: {
          type: 'string',
          format: 'binary',
          description: 'Audio file for Google Speech-to-Text',
        },
      },
    },
  })
  @RateLimit({ userLimit: 5, guestLimit: 3, windowMs: 60_000 })
  @UseGuards(RateLimitGuard)
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: MAX_AUDIO_UPLOAD_BYTES } }))
  transcribe(
    @UserOrGuest() owner: UserOrGuestContext,
    @Body() dto: TranscribeSpeechDto,
    @UploadedFile(new ParseFilePipe({ fileIsRequired: true }))
    audio: Express.Multer.File,
  ) {
    return this.speechService.transcribeAndSave(owner, dto, audio);
  }

  @Post('attempts/:attemptId/score')
  @ApiBearerAuth('jwt')
  @ApiBody({
    required: false,
    schema: {
      type: 'object',
      properties: {
        assessmentProvider: {
          type: 'string',
          enum: ['WHISPER_TEXT', 'GOOGLE_STT_TEXT'],
          description:
            'Optional assessment provider. GOPT has been removed.',
        },
      },
    },
  })
  @RateLimit({ userLimit: 5, guestLimit: 3, windowMs: 60_000 })
  @UseGuards(RateLimitGuard)
  scoreAttempt(
    @UserOrGuest() owner: UserOrGuestContext,
    @Param('attemptId') attemptId: string,
    @Body() dto: ScoreAttemptDto,
  ) {
    return this.speechService.scoreSavedAttempt(
      owner,
      attemptId,
      dto?.assessmentProvider,
    );
  }
}
