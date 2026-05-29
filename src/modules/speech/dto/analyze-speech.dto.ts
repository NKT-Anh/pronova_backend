import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

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
}
