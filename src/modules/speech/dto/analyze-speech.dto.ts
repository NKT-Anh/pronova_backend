import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export const ASSESSMENT_PROVIDERS = ['WHISPER_TEXT', 'GOOGLE_STT_TEXT'] as const;
export type AssessmentProvider = (typeof ASSESSMENT_PROVIDERS)[number];

export class AnalyzeSpeechDto {
  @IsString()
  @IsNotEmpty()
  textItemId: string;

  @IsString()
  @IsNotEmpty()
  languageCode: string;

  @IsString()
  @IsOptional()
  referenceText?: string;

  @IsString()
  @IsOptional()
  assessmentProvider?: AssessmentProvider | string;
}
