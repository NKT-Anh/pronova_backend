import { IsOptional, IsString } from 'class-validator';

export class TranscribeSpeechDto {
  @IsString()
  languageCode: string;

  @IsString()
  @IsOptional()
  folderId?: string;
}
