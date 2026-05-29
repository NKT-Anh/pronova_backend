import { AgeRange, Gender } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpdateUserSettingDto {
  @IsString()
  @IsOptional()
  theme?: string;

  @IsString()
  @IsOptional()
  language?: string;

  @IsInt()
  @Min(1)
  @Max(240)
  @IsOptional()
  dailyGoal?: number;

  @IsBoolean()
  @IsOptional()
  autoPlaySample?: boolean;

  @IsBoolean()
  @IsOptional()
  reminderEnabled?: boolean;

  @IsString()
  @IsOptional()
  reminderTime?: string;

  @IsBoolean()
  @IsOptional()
  allowDataCollection?: boolean;

  @IsString()
  @IsOptional()
  nativeLanguage?: string;

  @IsEnum(AgeRange)
  @IsOptional()
  ageRange?: AgeRange;

  @IsEnum(Gender)
  @IsOptional()
  gender?: Gender;
}
