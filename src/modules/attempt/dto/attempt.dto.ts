import { ProcessingStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateAttemptDto {
  @IsString()
  @IsNotEmpty()
  textItemId: string;

  @IsString()
  @IsNotEmpty()
  languageCode: string;

  @IsString()
  @IsOptional()
  userId?: string;

  @IsString()
  @IsOptional()
  guestId?: string;

  @IsNumber()
  @IsOptional()
  overallScore?: number;

  @IsNumber()
  @IsOptional()
  accuracyScore?: number;

  @IsNumber()
  @IsOptional()
  fluencyScore?: number;

  @IsNumber()
  @IsOptional()
  completenessScore?: number;

  @IsNumber()
  @IsOptional()
  prosodyScore?: number;

  @IsEnum(ProcessingStatus)
  @IsOptional()
  status?: ProcessingStatus;

  @IsString()
  @IsOptional()
  audioUrl?: string;

  @IsString()
  @IsOptional()
  errorMessage?: string;

  @IsString()
  @IsOptional()
  recognizedText?: string;

  @IsInt()
  @IsOptional()
  audioDuration?: number;

  @IsString()
  @IsOptional()
  audioFormat?: string;

  @IsInt()
  @IsOptional()
  sampleRate?: number;

  @IsBoolean()
  @IsOptional()
  isUsableForAI?: boolean;

  @IsObject()
  @IsOptional()
  details?: any;
}

export class QueryAttemptsDto {
  @IsString()
  @IsOptional()
  textItemId?: string;

  @IsEnum(ProcessingStatus)
  @IsOptional()
  status?: ProcessingStatus;

  @IsString()
  @IsOptional()
  languageCode?: string;
}
