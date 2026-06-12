import { IsOptional, IsString } from 'class-validator';
import type { AssessmentProvider } from './analyze-speech.dto';

export class ScoreAttemptDto {
  @IsString()
  @IsOptional()
  assessmentProvider?: AssessmentProvider | string;
}
