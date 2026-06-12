import { Module } from '@nestjs/common';
import { SpeechService } from './speech.service';
import { SpeechController } from './speech.controller';
import { AttemptModule } from '../attempt/attempt.module';
import { AiAssessmentModule } from '../ai-assessment/ai-assessment.module';

@Module({
  imports: [AttemptModule, AiAssessmentModule],
  controllers: [SpeechController],
  providers: [SpeechService],
})
export class SpeechModule {}
