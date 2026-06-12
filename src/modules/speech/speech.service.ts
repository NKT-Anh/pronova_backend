import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProcessingStatus } from '@prisma/client';
import { SpeechClient } from '@google-cloud/speech';
import { GoogleGenAI } from '@google/genai';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import { AttemptService } from '../attempt/attempt.service';
import { UserOrGuestContext } from '../../core/decorators/user-or-guest.decorator';
import {
  assertAudioDurationLimit,
  assertSupportedAudioUpload,
} from '../../core/upload/audio-file.validator';
import { PrismaService } from '../../core/prisma/prisma.service';
import {
  AnalyzeSpeechDto,
  AssessmentProvider,
} from './dto/analyze-speech.dto';
import { AnalyzeSpeechFreeDto } from './dto/analyze-speech-free.dto';
import { TranscribeSpeechDto } from './dto/transcribe-speech.dto';
import {
  AiAssessmentService,
  FreeSpeakingAssessment,
  ReadAloudAssessment,
} from '../ai-assessment/ai-assessment.service';
import * as fs from 'fs';
import { extname, join } from 'path';
import { GeminiConfigService } from '../../core/gemini/gemini-config.service';

@Injectable()
export class SpeechService {
  private googleSpeechClient?: SpeechClient;

  constructor(
    private attemptService: AttemptService,
    private configService: ConfigService,
    private prisma: PrismaService,
    private aiAssessmentService: AiAssessmentService,
    private geminiConfigService: GeminiConfigService,
  ) {}

  async transcribeAndSave(
    owner: UserOrGuestContext,
    dto: TranscribeSpeechDto,
    audio: Express.Multer.File,
  ) {
    assertSupportedAudioUpload(audio);
    await assertAudioDurationLimit(audio);

    const recognizedText = await this.transcribeWithGoogle(
      audio,
      dto.languageCode,
    );

    if (!recognizedText) {
      throw new BadRequestException(
        'Không nhận diện được giọng nói. Vui lòng thử lại.',
      );
    }

    const folderId = dto.folderId
      ? await this.assertOwnedFolder(owner, dto.folderId)
      : await this.getOrCreateFreeTalkFolder(owner);
    const translatedText = await this.translateTextWithGemini(recognizedText);

    const textItem = await this.prisma.textItem.create({
      data: {
        folderId,
        originalText: recognizedText,
        translatedText,
        sourceLang: dto.languageCode,
        destLang: translatedText ? 'vi' : undefined,
        voiceType: 'FEMALE',
        sampleAudioStatus: ProcessingStatus.NOT_QUEUED,
      },
    });

    const attempt = await this.attemptService.create(owner, {
      textItemId: textItem.id,
      languageCode: dto.languageCode,
      status: ProcessingStatus.NOT_QUEUED,
      recognizedText,
      audioFormat: this.resolveAudioFormat(audio),
    });
    const savedAttempt = await this.saveAttemptAudioFile(attempt, audio);

    return {
      textItem,
      attempt: savedAttempt,
      recognizedText,
      scoring: {
        status: ProcessingStatus.NOT_QUEUED,
        buttonLabel: 'Chấm điểm',
        scoreEndpoint: `/api/speech/attempts/${attempt.id}/score`,
      },
    };
  }

  async scoreSavedAttempt(
    owner: UserOrGuestContext,
    attemptId: string,
    assessmentProvider?: AssessmentProvider | string,
  ) {
    const attempt = await this.attemptService.findOne(owner, attemptId);
    const audio = await this.getAttemptAudioAsMulterFile(attempt);
    const referenceText = attempt.textItem.originalText || '';

    if (!referenceText.trim()) {
      throw new BadRequestException('Attempt does not have text to score');
    }

    await this.prisma.attempt.update({
      where: { id: attempt.id },
      data: { status: ProcessingStatus.PROCESSING, errorMessage: null },
    });

    try {
      const useGoogleTextScoring = this.shouldUseGoogleTextScoring(
        assessmentProvider,
      );
      const assessment = await this.aiAssessmentService.assessReadAloud({
        audio,
        text: referenceText,
        language: attempt.languageCode,
        recognizedText: useGoogleTextScoring ? attempt.recognizedText : undefined,
        assessmentProvider,
      });

      const scoredAttempt = await this.prisma.attempt.update({
        where: { id: attempt.id },
        data: {
          overallScore: assessment.overallScore,
          accuracyScore: assessment.accuracyScore,
          fluencyScore: assessment.fluencyScore,
          completenessScore: assessment.completenessScore,
          prosodyScore: assessment.prosodyScore,
          status: ProcessingStatus.COMPLETED,
          recognizedText: assessment.recognizedText || attempt.recognizedText,
          details: this.buildReadAloudDetails(assessment),
          isUsableForAI: assessment.isUsableForAI,
        },
        include: { textItem: true },
      });

      return {
        attempt: scoredAttempt,
        scoring: {
          status: ProcessingStatus.COMPLETED,
          buttonLabel: 'Điểm phát âm',
          overallScore: scoredAttempt.overallScore,
        },
      };
    } catch (error) {
      await this.prisma.attempt.update({
        where: { id: attempt.id },
        data: {
          status: ProcessingStatus.FAILED,
          errorMessage: this.buildErrorMessage(error, 'Failed to score attempt'),
          details: this.buildFailureDetails(error, assessmentProvider),
        },
      });
      throw error;
    }
  }

  async analyzeAndSave(
    owner: UserOrGuestContext,
    dto: AnalyzeSpeechDto,
    audio: Express.Multer.File,
  ) {
    assertSupportedAudioUpload(audio);
    await assertAudioDurationLimit(audio);

    const textItem = await this.attemptService.findOwnedTextItem(
      owner,
      dto.textItemId,
    );
    const referenceText = dto.referenceText?.trim() || textItem.originalText;

    if (!referenceText.trim()) {
      throw new BadRequestException('Reference text is required');
    }

    // 1. STT trước bằng Google/Gemini của backend
    const assessmentProvider = dto.assessmentProvider;
    const useGoogleTextScoring = this.shouldUseGoogleTextScoring(
      assessmentProvider,
    );
    const recognizedText =
      useGoogleTextScoring
        ? await this.transcribeWithGoogle(audio, dto.languageCode)
        : '';

    const attempt = await this.attemptService.create(owner, {
      textItemId: dto.textItemId,
      languageCode: dto.languageCode,
      status: ProcessingStatus.PROCESSING,
      audioFormat: this.resolveAudioFormat(audio),
    });

    await this.saveAttemptAudioFile(attempt, audio);

    try {
      // 2. AI-service chỉ tính điểm, không cần Whisper nữa
      const assessment = await this.aiAssessmentService.assessReadAloud({
        audio,
        text: referenceText,
        language: dto.languageCode,
        recognizedText: recognizedText || undefined,
        assessmentProvider,
      });

      return this.prisma.attempt.update({
        where: { id: attempt.id },
        data: {
          overallScore: assessment.overallScore,
          accuracyScore: assessment.accuracyScore,
          fluencyScore: assessment.fluencyScore,
          completenessScore: assessment.completenessScore,
          prosodyScore: assessment.prosodyScore,
          status: ProcessingStatus.COMPLETED,
          recognizedText: assessment.recognizedText || recognizedText || null,
          details: this.buildReadAloudDetails(assessment),
          isUsableForAI: assessment.isUsableForAI,
        },
      });
    } catch (error) {
      await this.markAttemptFailed(attempt.id, error);
      throw error;
    }
  }

  async analyzeFree(
    owner: UserOrGuestContext,
    dto: AnalyzeSpeechFreeDto,
    audio: Express.Multer.File,
  ) {
    assertSupportedAudioUpload(audio);
    await assertAudioDurationLimit(audio);
    const topic = dto.topic?.trim() || 'Free speaking';

    // 1. STT trước bằng Google/Gemini của backend
    const recognizedText = await this.transcribeWithGoogle(audio, dto.languageCode);

    if (!recognizedText || recognizedText.trim().length === 0) {
      throw new BadRequestException('Không nhận diện được giọng nói của bạn. Vui lòng nói to và thử lại!');
    }

    // 2. AI-service chỉ tính điểm với recognizedText có sẵn, không dùng Whisper
    const assessment = await this.aiAssessmentService.assessFreeSpeaking({
      audio,
      topic,
      language: dto.languageCode,
      recognizedText,
    });

    // 3. Translate recognized text bằng Gemini
    const translatedText = await this.translateTextWithGemini(assessment.recognizedText);

    // 4. Tạo folder "Luyện nói tự do" nếu chưa có
    const folderId = await this.getOrCreateFreeTalkFolder(owner);

    // 5. Lưu TextItem với recognized words và bản dịch
    const textItem = await this.prisma.textItem.create({
      data: {
        folderId,
        originalText: assessment.recognizedText.trim(),
        translatedText,
        sourceLang: dto.languageCode,
        destLang: 'vi',
        voiceType: 'FEMALE',
        sampleAudioStatus: ProcessingStatus.NOT_QUEUED,
      },
    });

    // 6. Lưu Attempt vào DB
    const attempt = await this.attemptService.create(owner, {
      textItemId: textItem.id,
      languageCode: dto.languageCode,
      overallScore: assessment.overallScore,
      fluencyScore: assessment.fluencyScore,
      status: ProcessingStatus.COMPLETED,
      recognizedText: assessment.recognizedText,
      details: this.buildFreeSpeakingDetails(assessment),
      audioFormat: this.resolveAudioFormat(audio),
      isUsableForAI: assessment.isUsableForAI,
    });

    return this.saveAttemptAudioFile(attempt, audio);
  }

  private async translateTextWithGemini(text: string): Promise<string | null> {
    if (!this.geminiConfigService.hasKey('chat')) return null;

    try {
      const model = this.geminiConfigService.resolveModel('chat');
      const client = this.geminiConfigService.getClient('chat');

      const response = await client.models.generateContent({
        model,
        contents: text,
        config: {
          temperature: 0.3,
          systemInstruction:
            'You are a precise translator. Translate the given sentence to natural, standard Vietnamese. Output ONLY the translated sentence, without explanations or extra characters.',
        },
      });

      return response.text?.trim() || null;
    } catch (error) {
      console.error('Failed to translate freestyle text using Gemini:', error.message);
      return null;
    }
  }

  private async transcribeWithGoogle(
    audio: Express.Multer.File,
    languageCode: string,
  ): Promise<string> {
    const googleLanguageCode = await this.resolveGoogleLanguageCode(languageCode);
    
    try {
      const client = this.getGoogleSpeechClient();
      const config: any = {
        languageCode: googleLanguageCode,
        enableAutomaticPunctuation: true,
      };

      const mime = audio.mimetype.toLowerCase();
      if (mime.includes('wav') || mime.includes('wave')) {
        config.encoding = 'LINEAR16';
        config.sampleRateHertz = 16000;
      }

      // 'latest_long' is only supported for a subset of languages (such as English).
      // For other languages like zh-CN, vi-VN, ja-JP, ko-KR, we let Google STT fallback to the default model.
      if (googleLanguageCode.startsWith('en')) {
        config.model = 'latest_long';
      }

      const [response] = await client.recognize({
        audio: {
          content: audio.buffer.toString('base64'),
        },
        config,
      });

      const recognizedText = response.results
        ?.map((result) => result.alternatives?.[0]?.transcript?.trim())
        .filter(Boolean)
        .join(' ')
        .trim();

      if (recognizedText) {
        console.log(`Google STT recognized (${googleLanguageCode}):`, recognizedText);
        return recognizedText;
      }

      console.warn(`Google STT returned empty results for language: ${googleLanguageCode}. Trying Gemini fallback...`);
    } catch (googleError) {
      console.warn(`Google STT failed for language ${googleLanguageCode}: ${googleError.message}. Falling back to Gemini...`);
    }

    return this.transcribeWithGemini(audio, languageCode);
  }

  private async transcribeWithGemini(
    audio: Express.Multer.File,
    languageCode: string,
  ): Promise<string> {
    try {
      const model = this.geminiConfigService.resolveModel('speechToText');
      const client = this.geminiConfigService.getClient('speechToText');

      let mimeType = audio.mimetype;
      if (mimeType === 'application/octet-stream') {
        mimeType = 'audio/wav';
      }

      const response = await client.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  data: audio.buffer.toString('base64'),
                  mimeType,
                },
              },
              {
                text: `Transcribe this speech to plain text only. The language of the audio is ${languageCode || 'auto'}. Provide ONLY the direct transcription in the original language. Do not translate. Output nothing else.`,
              },
            ],
          },
        ],
      });

      const text = response.text?.trim() || '';
      console.log(`Gemini STT Fallback recognized (${languageCode}):`, text);
      return text;
    } catch (geminiError) {
      console.error('Gemini STT Fallback also failed:', geminiError.message);
      return '';
    }
  }

  private getGoogleSpeechClient() {
    if (!this.googleSpeechClient) {
      this.googleSpeechClient = new SpeechClient();
    }

    return this.googleSpeechClient;
  }

  private async resolveGoogleLanguageCode(languageCode: string) {
    const language: any = await this.prisma.language.findUnique({
      where: { code: languageCode },
    });

    return language?.googleCode || languageCode;
  }

  private async assertOwnedFolder(owner: UserOrGuestContext, folderId: string) {
    const folder = await this.prisma.folder.findFirst({
      where: {
        id: folderId,
        ...(owner.userId
          ? { userId: owner.userId }
          : { guestId: await this.resolveGuestId(owner, false) }),
      },
    });

    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    return folder.id;
  }


  private async getOrCreateFreeTalkFolder(owner: UserOrGuestContext): Promise<string> {
    const folderName = 'Luyện nói tự do';
    
    if (owner.userId) {
      let folder = await this.prisma.folder.findFirst({
        where: { userId: owner.userId, name: folderName },
      });
      if (!folder) {
        folder = await this.prisma.folder.create({
          data: {
            name: folderName,
            userId: owner.userId,
            color: '#8B5CF6',
            icon: 'record_voice_over',
          },
        });
      }
      return folder.id;
    } else {
      const deviceId = owner.guestDeviceId!;
      // For Guest: Resolve guestId from guestDeviceId
      await this.prisma.guestSession.upsert({
        where: { deviceId },
        update: {},
        create: { deviceId },
      });

      const session = await this.prisma.guestSession.findUnique({
        where: { deviceId },
      });

      const guestId = session!.id;


      let folder = await this.prisma.folder.findFirst({
        where: { guestId, name: folderName },
      });
      if (!folder) {
        folder = await this.prisma.folder.create({
          data: {
            name: folderName,
            guestId,
            color: '#8B5CF6',
            icon: 'record_voice_over',
          },
        });
      }
      return folder.id;
    }
  }



  private async assessWithAzure(
    audio: Express.Multer.File,
    referenceText: string,
    azureLanguageCode: string,
  ) {
    const speechKey = this.configService.get<string>('AZURE_SPEECH_KEY');
    const speechRegion = this.configService.get<string>('AZURE_SPEECH_REGION');

    if (!speechKey || !speechRegion) {
      throw new ServiceUnavailableException(
        'Azure Speech is not configured. Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env',
      );
    }

    const speechConfig = sdk.SpeechConfig.fromSubscription(
      speechKey,
      speechRegion,
    );
    speechConfig.speechRecognitionLanguage = azureLanguageCode;

    const audioConfig = sdk.AudioConfig.fromWavFileInput(
      audio.buffer,
      audio.originalname,
    );
    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
    const pronunciationConfig = new sdk.PronunciationAssessmentConfig(
      referenceText,
      sdk.PronunciationAssessmentGradingSystem.HundredMark,
      sdk.PronunciationAssessmentGranularity.Phoneme,
      referenceText === '' ? false : true,
    );
    pronunciationConfig.enableProsodyAssessment = true;
    pronunciationConfig.applyTo(recognizer);


    try {
      const result = await this.recognizeOnce(recognizer);

      if (result.reason !== sdk.ResultReason.RecognizedSpeech) {
        const cancellation = sdk.CancellationDetails.fromResult(result);
        throw new BadRequestException(
          cancellation.errorDetails ||
            `Speech recognition failed with reason: ${sdk.ResultReason[result.reason]}`,
        );
      }

      const assessment = sdk.PronunciationAssessmentResult.fromResult(result);
      const jsonResult = result.properties.getProperty(
        sdk.PropertyId.SpeechServiceResponse_JsonResult,
      );
      const details = jsonResult ? JSON.parse(jsonResult) : assessment.detailResult;

      return {
        overallScore: assessment.pronunciationScore,
        accuracyScore: assessment.accuracyScore,
        fluencyScore: assessment.fluencyScore,
        completenessScore: assessment.completenessScore,
        prosodyScore: assessment.prosodyScore,
        recognizedText: result.text,
        details,
      };
    } finally {
      recognizer.close();
    }
  }

  private recognizeOnce(
    recognizer: sdk.SpeechRecognizer,
  ): Promise<sdk.SpeechRecognitionResult> {
    return new Promise((resolve, reject) => {
      recognizer.recognizeOnceAsync(resolve, reject);
    });
  }

  private async resolveAzureLanguageCode(languageCode: string) {
    const language = await this.prisma.language.findUnique({
      where: { code: languageCode },
    });

    return language?.azureCode || languageCode;
  }

  private assertWavAudio(audio: Express.Multer.File) {
    const fileName = audio.originalname.toLowerCase();
    const mimeType = audio.mimetype.toLowerCase();

    if (
      !fileName.endsWith('.wav') &&
      mimeType !== 'audio/wav' &&
      mimeType !== 'audio/x-wav' &&
      mimeType !== 'audio/wave'
    ) {
      throw new BadRequestException(
        'Only WAV audio is supported for pronunciation assessment',
      );
    }
  }

  async getAttemptAudioPath(attemptId: string): Promise<string> {
    const uploadDir = join(process.cwd(), 'uploads', 'attempts');
    const supportedExtensions = ['wav', 'mp3', 'm4a', 'mp4', 'webm'];

    for (const extension of supportedExtensions) {
      const candidatePath = join(uploadDir, `${attemptId}.${extension}`);
      if (fs.existsSync(candidatePath)) {
        return candidatePath;
      }
    }

    throw new NotFoundException('Không tìm thấy tệp ghi âm');
  }

  private async getAttemptAudioAsMulterFile(
    attempt: { id: string; audioFormat?: string | null },
  ): Promise<Express.Multer.File> {
    const filePath = await this.getAttemptAudioPath(attempt.id);
    const buffer = fs.readFileSync(filePath);
    const extension = this.resolveSavedAudioExtension(filePath, attempt.audioFormat);

    return {
      fieldname: 'audio',
      originalname: `${attempt.id}.${extension}`,
      encoding: '7bit',
      mimetype: this.resolveMimeTypeFromFormat(extension),
      size: buffer.length,
      buffer,
      destination: '',
      filename: `${attempt.id}.${extension}`,
      path: filePath,
      stream: fs.createReadStream(filePath),
    };
  }

  private async resolveGuestId(
    owner: UserOrGuestContext,
    createIfMissing: boolean,
  ) {
    if (owner.userId || !owner.guestDeviceId) {
      return undefined;
    }

    if (createIfMissing) {
      await this.prisma.guestSession.upsert({
        where: { deviceId: owner.guestDeviceId },
        update: {},
        create: { deviceId: owner.guestDeviceId },
      });
    }

    const session = await this.prisma.guestSession.findUnique({
      where: { deviceId: owner.guestDeviceId },
    });

    return session?.id;
  }

  private async saveAttemptAudioFile(attempt: any, audio: Express.Multer.File) {
    try {
      const uploadDir = join(process.cwd(), 'uploads', 'attempts');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      const audioFormat = this.resolveAudioFormat(audio);
      const filePath = join(uploadDir, `${attempt.id}.${audioFormat}`);
      fs.writeFileSync(filePath, audio.buffer);

      return this.prisma.attempt.update({
        where: { id: attempt.id },
        data: {
          audioUrl: `/api/speech/attempts/${attempt.id}/audio`,
          audioFormat,
        },
      });
    } catch (err) {
      console.error('Failed to save audio file:', err.message);
      return attempt;
    }
  }

  private resolveAudioFormat(audio: Express.Multer.File) {
    const extension = extname(audio.originalname || '').replace('.', '');
    if (extension) {
      return extension.toLowerCase();
    }

    const mimeToExtension: Record<string, string> = {
      'audio/wav': 'wav',
      'audio/x-wav': 'wav',
      'audio/wave': 'wav',
      'audio/mpeg': 'mp3',
      'audio/mp3': 'mp3',
      'audio/mp4': 'mp4',
      'audio/m4a': 'm4a',
      'audio/webm': 'webm',
    };

    return mimeToExtension[audio.mimetype?.toLowerCase()] || 'wav';
  }

  private resolveSavedAudioExtension(filePath: string, audioFormat?: string | null) {
    const pathExtension = extname(filePath).replace('.', '').toLowerCase();
    return pathExtension || audioFormat?.toLowerCase() || 'wav';
  }

  private resolveMimeTypeFromFormat(format: string) {
    const formatToMime: Record<string, string> = {
      wav: 'audio/wav',
      mp3: 'audio/mpeg',
      m4a: 'audio/m4a',
      mp4: 'audio/mp4',
      webm: 'audio/webm',
    };

    return formatToMime[format.toLowerCase()] || 'application/octet-stream';
  }

  private buildReadAloudDetails(assessment: ReadAloudAssessment): any {
    return {
      ...assessment.details,
      mode: assessment.mode,
      feedback: assessment.feedback,
      raw: assessment,
    };
  }

  private buildFreeSpeakingDetails(assessment: FreeSpeakingAssessment): any {
    return {
      ...assessment.details,
      mode: assessment.mode,
      assessmentProvider:
        assessment.details?.assessmentProvider || 'WHISPER_AI_SERVICE',
      pronunciationScore: assessment.pronunciationScore,
      grammarScore: assessment.grammarScore,
      vocabularyScore: assessment.vocabularyScore,
      contentScore: assessment.contentScore,
      correctedText: assessment.correctedText,
      feedback: assessment.feedback,
      raw: assessment,
    };
  }

  private async markAttemptFailed(attemptId: string, error: unknown) {
    await this.prisma.attempt.update({
      where: { id: attemptId },
      data: {
        status: ProcessingStatus.FAILED,
        errorMessage: this.buildErrorMessage(error, 'AI assessment failed'),
        details: this.buildFailureDetails(error),
      },
    });
  }

  private buildErrorMessage(error: unknown, fallback: string) {
    const response =
      error && typeof error === 'object' && 'getResponse' in error
        ? (error as any).getResponse()
        : undefined;
    if (typeof response === 'string') {
      return response;
    }
    if (response && typeof response === 'object') {
      if (typeof response.message === 'string') {
        return response.message;
      }
      if (typeof response.errorCode === 'string') {
        return response.errorCode;
      }
    }
    return error instanceof Error ? error.message : fallback;
  }

  private buildFailureDetails(
    error: unknown,
    requestedProvider?: AssessmentProvider | string,
  ) {
    const response =
      error && typeof error === 'object' && 'getResponse' in error
        ? (error as any).getResponse()
        : undefined;
    return {
      status: 'FAILED',
      requestedProvider,
      error:
        response && typeof response === 'object'
          ? response
          : {
              message: this.buildErrorMessage(error, 'AI assessment failed'),
            },
    };
  }

  private shouldUseGoogleTextScoring(provider?: AssessmentProvider | string) {
    const raw =
      provider ||
      this.configService.get<string>('AI_ASSESSMENT_PROVIDER') ||
      'whisper_text';
    const normalized = raw.toString().trim().toLowerCase();
    return normalized === 'google_stt_text' || normalized === 'external_text';
  }
}
