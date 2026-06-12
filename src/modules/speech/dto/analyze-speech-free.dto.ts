import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AnalyzeSpeechFreeDto {
  @IsString()
  @IsNotEmpty()
  languageCode: string;

  @IsString()
  @IsOptional()
  topic?: string;
}
