import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { UserOrGuestContext } from '../../core/decorators/user-or-guest.decorator';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SendTextChatDto, SendVoiceChatDto } from './dto/chat.dto';
import { TextToSpeechService } from '../text-to-speech/text-to-speech.service';
import {
  assertAudioDurationLimit,
  assertSupportedAudioUpload,
  normalizeAudioMimetype,
} from '../../core/upload/audio-file.validator';

const SUPPORTED_TRANSCRIPTION_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/mpga',
  'audio/m4a',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/webm',
]);

import { GeminiConfigService } from '../../core/gemini/gemini-config.service';

@Injectable()
export class ChatService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private textToSpeechService: TextToSpeechService,
    private geminiConfigService: GeminiConfigService,
  ) {}

  async sendText(owner: UserOrGuestContext, dto: SendTextChatDto) {
    this.assertGeminiConfigured();
    const conversation = await this.findOrCreateConversation(
      owner,
      dto.conversationId,
      dto.message,
    );
    await this.createMessage(conversation.id, 'user', dto.message, 'text', {
      languageCode: dto.languageCode,
    });

    return this.respondWithAssistant(owner, conversation.id, {
      languageCode: dto.languageCode,
      voice: dto.voice,
    });
  }

  async sendVoice(
    owner: UserOrGuestContext,
    dto: SendVoiceChatDto,
    audio: Express.Multer.File,
  ) {
    this.assertGeminiConfigured();
    assertSupportedAudioUpload(audio);
    await assertAudioDurationLimit(audio);
    this.assertSupportedAudio(audio);

    // [TEST] Bỏ qua chuyển đổi sang văn bản theo yêu cầu của user để kiểm tra việc lưu đoạn ghi âm
    // const transcribedText = await this.transcribeAudio(audio, dto.languageCode);
    const transcribedText = '🎙️ Tin nhắn thoại (Chưa chuyển sang văn bản)';

    const conversation = await this.findOrCreateConversation(
      owner,
      dto.conversationId,
      transcribedText,
    );

    // Lưu tin nhắn user kèm base64 của audio vào database
    await this.createMessage(conversation.id, 'user', transcribedText, 'voice', {
      languageCode: dto.languageCode,
      audioBase64: audio.buffer.toString('base64'),
      audioMimeType: audio.mimetype,
    });

    return this.respondWithAssistant(owner, conversation.id, {
      languageCode: dto.languageCode,
      voice: dto.voice,
      transcribedText,
    });
  }

  async findConversations(owner: UserOrGuestContext) {
    const where = await this.ownerWhere(owner, false);

    if (!where) {
      return [];
    }

    return this.prisma.chatConversation.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
  }

  async findConversation(owner: UserOrGuestContext, id: string) {
    return this.getOwnedConversation(owner, id);
  }

  private async respondWithAssistant(
    owner: UserOrGuestContext,
    conversationId: string,
    options: {
      languageCode?: string;
      voice?: string;
      transcribedText?: string;
    },
  ) {
    const conversation = await this.getOwnedConversation(owner, conversationId);
    const assistantText = await this.createAssistantText(conversation.messages);
    const audio = await this.createAssistantAudio(
      assistantText,
      options.voice || 'Kore',
    );
    await this.createMessage(conversation.id, 'assistant', assistantText, 'text', {
      languageCode: options.languageCode,
      audioBase64: audio.audioBase64,
      audioMimeType: audio.mimeType,
    });

    const updatedConversation = await this.getOwnedConversation(
      owner,
      conversation.id,
    );

    return {
      conversation: updatedConversation,
      input: options.transcribedText
        ? { mode: 'voice', transcribedText: options.transcribedText }
        : { mode: 'text' },
      assistant: {
        text: assistantText,
        audio,
      },
    };
  }

  private async createAssistantText(
    messages: Array<{ role: string; content: string }>,
  ) {
    const recentMessages = messages.slice(-12);
    const transcript = recentMessages
      .map((message) => `${message.role}: ${message.content}`)
      .join('\n');
    const model = this.geminiConfigService.resolveModel('chat');
    const client = this.geminiConfigService.getClient('chat');

    try {
      const response = await client.models.generateContent({
        model,
        contents: `Conversation so far:\n${transcript}\n\nReply as assistant.`,
        config: {
          systemInstruction:
            'You are a friendly pronunciation practice chatbot. Keep replies concise, natural, and useful for language learners. If the user makes a grammar or pronunciation-related mistake, gently correct it and continue the conversation.',
        },
      });

      const text = response.text?.trim();

      if (!text) {
        throw new ServiceUnavailableException('Chatbot returned an empty reply');
      }

      return text;
    } catch (error) {
      if (error instanceof ServiceUnavailableException && error.message.includes('empty reply')) {
        throw error;
      }
      this.geminiConfigService.mapGeminiError(error, 'chat');
    }
  }

  private async createAssistantAudio(text: string, voice: string) {
    const audio = await this.textToSpeechService.synthesize({
      text,
      voiceName: voice,
    });

    return {
      mimeType: audio.mimeType,
      format: audio.format,
      audioBase64: audio.audioBase64,
      voiceName: audio.voiceName,
      provider: audio.provider,
      model: audio.model,
      disclosure: 'AI-generated voice by Google Text-to-Speech',
    };
  }

  private async transcribeAudio(
    audio: Express.Multer.File,
    languageCode?: string,
  ) {
    const model = this.geminiConfigService.resolveModel('speechToText');
    try {
      const response = await this.getSpeechToTextClient().models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  data: audio.buffer.toString('base64'),
                  mimeType: audio.mimetype,
                },
              },
              {
                text: `Transcribe this speech to plain text only. Language hint: ${languageCode || 'auto'}.`,
              },
            ],
          },
        ],
      });

      const text = response.text;

      if (!text?.trim()) {
        throw new BadRequestException('Could not transcribe audio');
      }

      return text.trim();
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.geminiConfigService.mapGeminiError(error, 'speechToText');
    }
  }

  private async findOrCreateConversation(
    owner: UserOrGuestContext,
    conversationId?: string,
    firstMessage?: string,
  ) {
    if (conversationId) {
      return this.getOwnedConversation(owner, conversationId);
    }

    const guestId = await this.resolveGuestId(owner, true);
    const title = firstMessage ? this.createTitle(firstMessage) : undefined;

    return this.prisma.chatConversation.create({
      data: {
        title,
        userId: owner.userId,
        guestId,
      },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
  }

  private async getOwnedConversation(
    owner: UserOrGuestContext,
    conversationId: string,
  ) {
    const where = await this.ownerWhere(owner, false);

    if (!where) {
      throw new NotFoundException('Conversation not found');
    }

    const conversation = await this.prisma.chatConversation.findFirst({
      where: {
        id: conversationId,
        ...where,
      },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    return conversation;
  }

  private async createMessage(
    conversationId: string,
    role: string,
    content: string,
    inputMode: string,
    options: {
      languageCode?: string;
      audioMimeType?: string;
      audioBase64?: string;
    },
  ) {
    const message = await this.prisma.chatMessage.create({
      data: {
        conversationId,
        role,
        content,
        inputMode,
        languageCode: options.languageCode,
        audioMimeType: options.audioMimeType,
        audioBase64: options.audioBase64,
      },
    });
    await this.prisma.chatConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    return message;
  }

  private async ownerWhere(
    owner: UserOrGuestContext,
    createGuestIfMissing: boolean,
  ) {
    if (owner.userId) {
      return { userId: owner.userId };
    }

    const guestId = await this.resolveGuestId(owner, createGuestIfMissing);
    return guestId ? { guestId } : null;
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

  private assertGeminiConfigured() {
    this.geminiConfigService.resolveApiKey('chat');
  }

  private assertSupportedAudio(audio: Express.Multer.File) {
    const mimeType = normalizeAudioMimetype(audio);
    if (!SUPPORTED_TRANSCRIPTION_MIME_TYPES.has(mimeType)) {
      throw new BadRequestException(
        'Unsupported audio type. Use mp3, mp4, mpeg, mpga, m4a, wav, or webm.',
      );
    }
  }

  private createTitle(message: string) {
    const normalized = message.replace(/\s+/g, ' ').trim();
    return normalized.length > 60
      ? `${normalized.slice(0, 57).trim()}...`
      : normalized;
  }

  private getSpeechToTextClient() {
    return this.geminiConfigService.getClient('speechToText');
  }
}
