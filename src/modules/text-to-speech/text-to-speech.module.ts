import { Module } from '@nestjs/common';
import { TextToSpeechService } from './text-to-speech.service';
import { PrismaModule } from '../../core/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [TextToSpeechService],
  exports: [TextToSpeechService],
})
export class TextToSpeechModule {}
