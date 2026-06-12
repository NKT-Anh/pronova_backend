import { Controller, Get, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppService } from './app.service';
import { GeminiConfigService } from './core/gemini/gemini-config.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly configService: ConfigService,
    private readonly geminiConfigService: GeminiConfigService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  health() {
    return this.appService.health();
  }

  @Get('debug/gemini-config')
  getGeminiConfig() {
    const isDev = this.configService.get('NODE_ENV') !== 'production';
    if (!isDev) {
      throw new NotFoundException();
    }

    const chatKeyInfo = this.getDebugInfo('chat');
    const speechToTextKeyInfo = this.getDebugInfo('speechToText');
    const textToSpeechKeyInfo = this.getDebugInfo('textToSpeech');

    return {
      chat: {
        keySource: chatKeyInfo.source,
        hasKey: chatKeyInfo.hasKey,
        model: this.geminiConfigService.resolveModel('chat'),
      },
      speechToText: {
        keySource: speechToTextKeyInfo.source,
        hasKey: speechToTextKeyInfo.hasKey,
        model: this.geminiConfigService.resolveModel('speechToText'),
      },
      textToSpeech: {
        keySource: textToSpeechKeyInfo.source,
        hasKey: textToSpeechKeyInfo.hasKey,
        model: this.geminiConfigService.resolveModel('textToSpeech'),
      },
    };
  }

  private getDebugInfo(purpose: 'chat' | 'speechToText' | 'textToSpeech') {
    try {
      const resolved = this.geminiConfigService.resolveApiKey(purpose);
      return {
        source: resolved.source,
        hasKey: true,
      };
    } catch {
      return {
        source: 'missing',
        hasKey: false,
      };
    }
  }
}
