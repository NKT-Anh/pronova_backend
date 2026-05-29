import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SendTextChatDto {
  @IsString()
  @IsOptional()
  conversationId?: string;

  @IsString()
  @MaxLength(4000)
  message: string;

  @IsString()
  @IsOptional()
  languageCode?: string;

  @IsString()
  @IsOptional()
  voice?: string;
}

export class SendVoiceChatDto {
  @IsString()
  @IsOptional()
  conversationId?: string;

  @IsString()
  @IsOptional()
  languageCode?: string;

  @IsString()
  @IsOptional()
  voice?: string;
}
