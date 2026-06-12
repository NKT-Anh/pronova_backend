import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { VoiceType } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';

export type TextToSpeechResult = {
  buffer: Buffer;
  audioBase64: string;
  mimeType: string;
  format: string;
  provider: 'google';
  model: string;
  voiceName: string;
};

@Injectable()
export class TextToSpeechService {
  private client?: TextToSpeechClient;

  constructor(private prisma: PrismaService) {}

  private getClient(): TextToSpeechClient {
    if (!this.client) {
      this.client = new TextToSpeechClient();
    }
    return this.client;
  }

  async getLanguageByCode(code: string) {
    const language = await this.prisma.language.findUnique({
      where: { code },
    });
    if (!language) {
      throw new ServiceUnavailableException(`Unsupported language code: ${code}`);
    }
    return language;
  }

  async getGoogleCodeByCode(code: string) {
    const language = await this.getLanguageByCode(code);
    if (!language.googleCode) {
      throw new ServiceUnavailableException(`Google TTS language code is not configured for: ${code}`);
    }
    return language.googleCode;
  }

  async synthesize(options: {
    text: string;
    languageCode?: string;
    voiceName?: string;
    voiceType?: VoiceType;
  }): Promise<TextToSpeechResult> {
    const text = options.text.trim();
    const codeInput = options.languageCode || 'en';

    // Resolve googleCode from DB
    const googleCode = await this.getGoogleCodeByCode(codeInput);

    // Resolve the final Google Cloud TTS voice name based on language and voice preferences
    const voiceNameInput = options.voiceName || (options.voiceType === VoiceType.MALE ? 'MALE' : 'FEMALE');
    const voiceName = this.resolveGoogleVoiceName(voiceNameInput, googleCode);

    // Derive a matching language code from the Google voice name (e.g. "en-US" from "en-US-Neural2-F") to prevent mismatch errors
    let finalLanguageCode = googleCode;
    if (voiceName.includes('-')) {
      const parts = voiceName.split('-');
      if (parts.length >= 2) {
        finalLanguageCode = `${parts[0]}-${parts[1]}`;
      }
    }

    try {
      const request = {
        input: { text },
        voice: {
          languageCode: finalLanguageCode,
          name: voiceName,
        },
        audioConfig: {
          audioEncoding: 'MP3' as const,
        },
      };

      const [response] = await this.getClient().synthesizeSpeech(request);

      if (!response.audioContent) {
        throw new ServiceUnavailableException('Google Text-to-Speech returned no audio');
      }

      const buffer = Buffer.from(response.audioContent as Uint8Array);
      const audioBase64 = buffer.toString('base64');
      const mimeType = 'audio/mpeg';

      return {
        buffer,
        audioBase64,
        mimeType,
        format: 'mp3',
        provider: 'google',
        model: 'google-cloud-tts',
        voiceName,
      };
    } catch (error) {
      console.error('[GoogleTTS] Error occurred during synthesis:', error.message);
      throw new ServiceUnavailableException({
        message: `Google Text-to-Speech service is unavailable: ${error.message}`,
        code: 'GOOGLE_TTS_SERVICE_UNAVAILABLE',
      });
    }
  }

  resolveVoiceName(voiceName?: string, voiceType?: VoiceType) {
    if (voiceName && voiceName.includes('-')) {
      return voiceName;
    }
    if (voiceName === 'Puck' || voiceType === VoiceType.MALE) {
      return 'MALE';
    }
    if (voiceName === 'Kore' || voiceType === VoiceType.NEUTRAL) {
      return 'NEUTRAL';
    }
    return 'FEMALE';
  }

  private resolveGoogleVoiceName(voiceName: string, languageCode: string): string {
    // If it's already a valid Google Cloud voice name (contains hyphens), return it
    if (voiceName.includes('-')) {
      return voiceName;
    }

    const lang = languageCode.toLowerCase();
    const isMale = voiceName === 'MALE';

    if (lang.startsWith('vi')) {
      // Vietnamese
      return isMale ? 'vi-VN-Wavenet-B' : 'vi-VN-Wavenet-A';
    } else if (lang.startsWith('ja')) {
      // Japanese
      return isMale ? 'ja-JP-Wavenet-D' : 'ja-JP-Wavenet-B';
    } else if (lang.startsWith('ko')) {
      // Korean
      return isMale ? 'ko-KR-Wavenet-C' : 'ko-KR-Wavenet-A';
    } else if (lang.startsWith('zh')) {
      // Chinese
      return isMale ? 'cmn-CN-Wavenet-B' : 'cmn-CN-Wavenet-A';
    } else {
      // English (en-US) default
      return isMale ? 'en-US-Neural2-J' : 'en-US-Neural2-F';
    }
  }
}
