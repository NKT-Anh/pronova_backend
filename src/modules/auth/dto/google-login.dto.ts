import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GoogleLoginDto {
  @ApiProperty({
    description: 'The Google ID Token received from Google Sign-In SDK on the client app',
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjE2...',
  })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({
    description: 'Optional guest session ID to sync data from guest to registered user',
    required: false,
    example: 'd9b0a1d4-8d48-4395-8e3b-c2e55d64ffc9',
  })
  @IsString()
  @IsOptional()
  guestId?: string;
}
