import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProcessingStatus } from '@prisma/client';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import { AttemptService } from '../attempt/attempt.service';
import { UserOrGuestContext } from '../../core/decorators/user-or-guest.decorator';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AnalyzeSpeechDto } from './dto/analyze-speech.dto';

@Injectable()
export class SpeechService {
  constructor(
    private attemptService: AttemptService,
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {}

  async analyzeAndSave(
    owner: UserOrGuestContext,
    dto: AnalyzeSpeechDto,
    audio: Express.Multer.File,
  ) {
    this.assertWavAudio(audio);

    const textItem = await this.attemptService.findOwnedTextItem(
      owner,
      dto.textItemId,
    );
    const referenceText = dto.referenceText?.trim() || textItem.originalText;
    const azureLanguageCode = await this.resolveAzureLanguageCode(
      dto.languageCode,
    );
    const assessment = await this.assessWithAzure(
      audio,
      referenceText,
      azureLanguageCode,
    );

    return this.attemptService.create(owner, {
      ...dto,
      languageCode: dto.languageCode,
      overallScore: assessment.overallScore,
      accuracyScore: assessment.accuracyScore,
      fluencyScore: assessment.fluencyScore,
      completenessScore: assessment.completenessScore,
      prosodyScore: assessment.prosodyScore,
      status: ProcessingStatus.COMPLETED,
      recognizedText: assessment.recognizedText,
      details: assessment.details,
      audioFormat: this.resolveAudioFormat(audio),
    });
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
      true,
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

  private resolveAudioFormat(audio: Express.Multer.File) {
    const extension = audio.originalname.split('.').pop();
    return extension?.toLowerCase() || 'wav';
  }
}
