import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';

export type GeminiKeyPurpose = 'chat' | 'speechToText' | 'textToSpeech';

export interface ResolvedGeminiKey {
  value: string;
  source: string;
  masked: string;
}

@Injectable()
export class GeminiConfigService {
  private readonly clients = new Map<GeminiKeyPurpose, GoogleGenAI>();

  constructor(private readonly configService: ConfigService) {}

  resolveApiKey(purpose: GeminiKeyPurpose): ResolvedGeminiKey {
    const candidates = this.getCandidates(purpose);

    for (const candidate of candidates) {
      const value = this.configService.get<string>(candidate)?.trim();
      if (value) {
        return {
          value,
          source: candidate,
          masked: this.maskKey(value),
        };
      }
    }

    throw new ServiceUnavailableException({
      message: `Gemini ${purpose} API key is not configured. Set a suitable env variable (e.g. GEMINI_API_KEY).`,
      code: `GEMINI_${this.toSnakeCase(purpose)}_KEY_MISSING`,
    });
  }

  resolveModel(purpose: GeminiKeyPurpose): string {
    switch (purpose) {
      case 'chat':
        return (
          this.configService.get<string>('GEMINI_CHAT_MODEL') ||
          'gemini-2.5-flash'
        );
      case 'speechToText':
        return (
          this.configService.get<string>('GEMINI_SPEECH_TO_TEXT_MODEL') ||
          this.configService.get<string>('GEMINI_TRANSCRIBE_MODEL') ||
          'gemini-2.5-flash'
        );
      case 'textToSpeech':
        return (
          this.configService.get<string>('GEMINI_TEXT_TO_SPEECH_MODEL') ||
          this.configService.get<string>('GEMINI_TTS_MODEL') ||
          'gemini-2.5-flash-preview-tts'
        );
    }
  }

  getClient(purpose: GeminiKeyPurpose): GoogleGenAI {
    if (!this.clients.has(purpose)) {
      const resolved = this.resolveApiKey(purpose);
      console.log(`[GeminiConfig] Initializing client for '${purpose}' using source: ${resolved.source} (${resolved.masked})`);
      const client = new GoogleGenAI({ apiKey: resolved.value });
      this.clients.set(purpose, client);
    }
    return this.clients.get(purpose)!;
  }

  hasKey(purpose: GeminiKeyPurpose): boolean {
    const candidates = this.getCandidates(purpose);
    return candidates.some((candidate) => !!this.configService.get<string>(candidate)?.trim());
  }

  mapGeminiError(error: any, purpose: GeminiKeyPurpose): never {
    const errorStr = error instanceof Error ? error.message : String(error);
    const purposeUpper = this.toSnakeCase(purpose).toUpperCase();

    // Log masked config instead of secrets
    let resolvedInfo = 'unknown key';
    try {
      const resolved = this.resolveApiKey(purpose);
      resolvedInfo = `${resolved.source} (${resolved.masked})`;
    } catch (e) {
      resolvedInfo = 'no key configured';
    }

    console.error(`[GeminiConfig] Error occurred during ${purpose} [using ${resolvedInfo}]:`, errorStr);

    const status = error?.status || error?.statusCode || error?.response?.status;
    if (status === 429) {
      throw new ServiceUnavailableException({
        message: `Gemini ${purpose} quota or rate limit exceeded.`,
        code: `GEMINI_${purposeUpper}_QUOTA_EXCEEDED`,
      });
    }

    // Check for API_KEY_SERVICE_BLOCKED
    if (errorStr.includes('API_KEY_SERVICE_BLOCKED')) {
      throw new ServiceUnavailableException({
        message: `Gemini ${purpose} provider is unavailable or blocked.`,
        code: `GEMINI_${purposeUpper}_PROVIDER_BLOCKED`,
      });
    }

    // Check for API_KEY_INVALID / invalid key
    if (
      errorStr.includes('API_KEY_INVALID') ||
      errorStr.toLowerCase().includes('invalid api key') ||
      errorStr.toLowerCase().includes('invalid key') ||
      status === 400
    ) {
      throw new ServiceUnavailableException({
        message: `Gemini ${purpose} API key is invalid.`,
        code: `GEMINI_${purposeUpper}_API_KEY_INVALID`,
      });
    }

    // Check for PERMISSION_DENIED
    if (
      errorStr.includes('PERMISSION_DENIED') ||
      errorStr.toLowerCase().includes('permission denied') ||
      status === 403
    ) {
      throw new ServiceUnavailableException({
        message: `Gemini ${purpose} permission denied.`,
        code: `GEMINI_${purposeUpper}_PERMISSION_DENIED`,
      });
    }

    // Check for quota / rate limit (429 or RESOURCE_EXHAUSTED)
    if (
      errorStr.includes('RESOURCE_EXHAUSTED') ||
      errorStr.toLowerCase().includes('quota') ||
      errorStr.toLowerCase().includes('rate limit')
    ) {
      throw new ServiceUnavailableException({
        message: `Gemini ${purpose} quota or rate limit exceeded.`,
        code: `GEMINI_${purposeUpper}_QUOTA_EXCEEDED`,
      });
    }

    // Check for timeout / network issues
    if (
      errorStr.toLowerCase().includes('timeout') ||
      errorStr.toLowerCase().includes('network') ||
      errorStr.toLowerCase().includes('fetch failed') ||
      errorStr.includes('ETIMEDOUT')
    ) {
      throw new ServiceUnavailableException({
        message: `Gemini ${purpose} request timed out or network error occurred.`,
        code: `GEMINI_${purposeUpper}_TIMEOUT`,
      });
    }

    // Default fallback error
    throw new ServiceUnavailableException({
      message: `Gemini ${purpose} failed: ${errorStr}`,
      code: `GEMINI_${purposeUpper}_FAILED`,
    });
  }

  private getCandidates(purpose: GeminiKeyPurpose): string[] {
    switch (purpose) {
      case 'chat':
        return ['GEMINI_CHAT_API_KEY', 'GEMINI_API_KEY'];
      case 'speechToText':
        return ['GEMINI_SPEECH_TO_TEXT_API_KEY', 'GEMINI_API_KEY'];
      case 'textToSpeech':
        return ['GEMINI_TEXT_TO_SPEECH_API_KEY', 'GEMINI_TTS_API_KEY', 'GEMINI_API_KEY'];
    }
  }

  private maskKey(key: string): string {
    if (key.length <= 8) return '***';
    return `${key.slice(0, 4)}...${key.slice(-4)}`;
  }

  private toSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase();
  }
}
