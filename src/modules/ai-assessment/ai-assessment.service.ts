import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import FormData from 'form-data';
import type { AssessmentProvider } from '../speech/dto/analyze-speech.dto';

export interface ReadAloudAssessment {
  mode: 'READ_ALOUD';
  referenceText: string;
  recognizedText: string | null;
  overallScore: number | null;
  accuracyScore: number | null;
  fluencyScore: number | null;
  completenessScore: number | null;
  pronunciationScore?: number | null;
  prosodyScore: number | null;
  isUsableForAI: boolean;
  feedback: Record<string, unknown>;
  details: Record<string, unknown>;
}

export interface FreeSpeakingAssessment {
  mode: 'FREE_SPEAKING';
  topic: string;
  recognizedText: string;
  overallScore: number;
  pronunciationScore: number;
  fluencyScore: number;
  grammarScore: number | null;
  vocabularyScore: number | null;
  contentScore: number | null;
  correctedText: string | null;
  isUsableForAI: boolean;
  feedback: Record<string, unknown>;
  details: Record<string, unknown>;
}

@Injectable()
export class AiAssessmentService {
  constructor(private readonly configService: ConfigService) {}

  async assessReadAloud(params: {
    audio: Express.Multer.File;
    text: string;
    language: string;
    recognizedText?: string | null;
    assessmentProvider?: AssessmentProvider | string | null;
  }): Promise<ReadAloudAssessment> {
    const provider = this.resolveReadAloudProvider(params.assessmentProvider);

    if (provider === 'external_text') {
      return this.assessReadAloudWithExternalText(params);
    }

    return this.assessReadAloudWithLegacyAiRoute(params);
  }

  private async assessReadAloudWithLegacyAiRoute(params: {
    audio: Express.Multer.File;
    text: string;
    language: string;
    recognizedText?: string | null;
  }): Promise<ReadAloudAssessment> {
    const form = this.createAudioForm(params.audio);
    form.append('text', params.text);
    form.append('language', params.language);
    if (params.recognizedText) {
      form.append('recognized_text', params.recognizedText);
    }

    return this.postToAiService<ReadAloudAssessment>(
      '/api/assess-read-aloud',
      form,
    );
  }

  private async assessReadAloudWithExternalText(params: {
    text: string;
    language: string;
    recognizedText?: string | null;
  }): Promise<ReadAloudAssessment> {
    const recognizedText = params.recognizedText?.trim();
    if (!recognizedText) {
      throw new BadRequestException(
        'recognizedText is required for external_text assessment',
      );
    }
    return this.postJsonToAiService<ReadAloudAssessment>(
      '/pronunciation/read-aloud',
      {
        referenceText: params.text,
        recognizedText,
        language: params.language,
      },
    );
  }

  async assessFreeSpeaking(params: {
    audio: Express.Multer.File;
    topic: string;
    language: string;
    recognizedText?: string | null;
  }): Promise<FreeSpeakingAssessment> {
    const form = this.createAudioForm(params.audio);
    form.append('topic', params.topic);
    form.append('language', params.language);
    if (params.recognizedText) {
      form.append('recognized_text', params.recognizedText);
    }

    return this.postToAiService<FreeSpeakingAssessment>(
      '/api/assess-free-speaking',
      form,
    );
  }

  private createAudioForm(audio: Express.Multer.File) {
    const form = new FormData();
    form.append('audio', audio.buffer, {
      filename: audio.originalname || audio.filename || 'audio.wav',
      contentType: audio.mimetype || 'application/octet-stream',
      knownLength: audio.size || audio.buffer.length,
    });
    return form;
  }

  private resolveReadAloudProvider(provider?: AssessmentProvider | string | null) {
    const raw =
      provider ||
      this.configService.get<string>('AI_ASSESSMENT_PROVIDER') ||
      'whisper_text';
    const normalized = raw.toString().trim().toLowerCase();
    if (normalized === 'gopt') {
      throw new BadRequestException(
        'GOPT provider has been removed. Use WHISPER_TEXT or GOOGLE_STT_TEXT.',
      );
    }
    if (normalized === 'external_text' || normalized === 'google_stt_text') {
      return 'external_text';
    }
    if (normalized === 'whisper_text' || normalized === 'legacy_ai_service') {
      return 'whisper_text';
    }
    throw new BadRequestException(
      'Unsupported assessmentProvider. Use WHISPER_TEXT or GOOGLE_STT_TEXT.',
    );
  }

  private async postToAiService<T>(path: string, form: FormData): Promise<T> {
    const baseUrl =
      this.configService.get<string>('AI_SERVICE_URL') ||
      'http://localhost:8000';
    const timeoutMs = Number.parseInt(
      this.configService.get<string>('AI_SERVICE_TIMEOUT_MS') || '60000',
      10,
    );

    try {
      const response = await axios.post<T>(`${baseUrl}${path}`, form, {
        headers: form.getHeaders(),
        maxBodyLength: Infinity,
        timeout: timeoutMs,
      });

      return response.data;
    } catch (error) {
      throw this.toNestException(error);
    }
  }

  private async postJsonToAiService<T>(
    path: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const baseUrl =
      this.configService.get<string>('AI_SERVICE_URL') ||
      'http://localhost:8000';
    const timeoutMs = Number.parseInt(
      this.configService.get<string>('AI_SERVICE_TIMEOUT_MS') || '60000',
      10,
    );

    try {
      const response = await axios.post<T>(`${baseUrl}${path}`, body, {
        timeout: timeoutMs,
      });

      return response.data;
    } catch (error) {
      throw this.toNestException(error);
    }
  }

  private toNestException(error: unknown) {
    if (!axios.isAxiosError(error)) {
      return new ServiceUnavailableException('AI assessment service failed');
    }

    const axiosError = error as AxiosError<any>;
    const detail = axiosError.response?.data?.detail;
    const errorCode =
      typeof detail === 'object'
        ? detail.error || detail.code
        : undefined;
    const message =
      typeof detail === 'string'
        ? detail
        : typeof detail?.message === 'string'
          ? detail.message
          : typeof detail?.detail === 'string'
            ? detail.detail
            : axiosError.message || 'AI assessment service failed';

    if (axiosError.response?.status === 400) {
      return new BadRequestException(message);
    }

    return new ServiceUnavailableException({
      status: 'FAILED',
      errorCode: errorCode || 'AI_ASSESSMENT_UNAVAILABLE',
      message,
      aiServiceDetail: detail,
    });
  }
}
