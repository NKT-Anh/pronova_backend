import { VoiceType } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateTextItemDto {
  @IsString()
  @IsNotEmpty()
  folderId: string;

  @IsString()
  @IsNotEmpty()
  originalText: string;

  @IsString()
  @IsOptional()
  translatedText?: string;

  @IsString()
  @IsNotEmpty()
  sourceLang: string;

  @IsString()
  @IsOptional()
  destLang?: string;

  @IsEnum(VoiceType)
  @IsOptional()
  voiceType?: VoiceType;

  @IsString()
  @IsOptional()
  voiceProvider?: string;

  @IsString()
  @IsOptional()
  voiceName?: string;
}

export class UpdateTextItemDto {
  @IsString()
  @IsOptional()
  originalText?: string;

  @IsString()
  @IsOptional()
  translatedText?: string;

  @IsString()
  @IsOptional()
  sourceLang?: string;

  @IsString()
  @IsOptional()
  destLang?: string;

  @IsEnum(VoiceType)
  @IsOptional()
  voiceType?: VoiceType;

  @IsString()
  @IsOptional()
  voiceProvider?: string;

  @IsString()
  @IsOptional()
  voiceName?: string;
}

export class GenerateTextItemSpeechDto {
  @IsString()
  @IsOptional()
  text?: string;

  @IsString()
  @IsOptional()
  languageCode?: string;

  @IsEnum(VoiceType)
  @IsOptional()
  voiceType?: VoiceType;

  @IsString()
  @IsOptional()
  voiceName?: string;
}
