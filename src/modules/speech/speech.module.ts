import { Module } from '@nestjs/common';
import { SpeechService } from './speech.service';
import { SpeechController } from './speech.controller';
import { AttemptModule } from '../attempt/attempt.module';
import { AttemptService } from '../attempt/attempt.service';

@Module({
  imports: [AttemptModule], // Import AttemptModule to use its service
  controllers: [SpeechController],
  providers: [SpeechService],
})
export class SpeechModule {}
