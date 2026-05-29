import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI, { toFile } from 'openai';
import { UserOrGuestContext } from '../../core/decorators/user-or-guest.decorator';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SendTextChatDto, SendVoiceChatDto } from './dto/chat.dto';

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

@Injectable()
export class ChatService {
  private readonly openai: OpenAI;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY') || 'missing-key',
    });
  }

  async sendText(owner: UserOrGuestContext, dto: SendTextChatDto) {
    this.assertOpenAiConfigured();
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
    this.assertOpenAiConfigured();
    this.assertSupportedAudio(audio);
    const transcribedText = await this.transcribeAudio(audio, dto.languageCode);
    const conversation = await this.findOrCreateConversation(
      owner,
      dto.conversationId,
      transcribedText,
    );
    await this.createMessage(conversation.id, 'user', transcribedText, 'voice', {
      languageCode: dto.languageCode,
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
      options.voice || 'alloy',
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
    const model =
      this.configService.get<string>('OPENAI_CHAT_MODEL') || 'gpt-4o-mini';

    const response = await this.openai.responses.create({
      model,
      instructions:
        'You are a friendly pronunciation practice chatbot. Keep replies concise, natural, and useful for language learners. If the user makes a grammar or pronunciation-related mistake, gently correct it and continue the conversation.',
      input: `Conversation so far:\n${transcript}\n\nReply as assistant.`,
    });

    const text = response.output_text?.trim();

    if (!text) {
      throw new ServiceUnavailableException('Chatbot returned an empty reply');
    }

    return text;
  }

  private async createAssistantAudio(text: string, voice: string) {
    const model =
      this.configService.get<string>('OPENAI_TTS_MODEL') || 'gpt-4o-mini-tts';
    const response = await this.openai.audio.speech.create({
      model,
      voice: voice as never,
      input: text,
      response_format: 'mp3',
    });
    const audioBuffer = Buffer.from(await response.arrayBuffer());

    return {
      mimeType: 'audio/mpeg',
      format: 'mp3',
      audioBase64: audioBuffer.toString('base64'),
      disclosure: 'AI-generated voice',
    };
  }

  private async transcribeAudio(
    audio: Express.Multer.File,
    languageCode?: string,
  ) {
    const model =
      this.configService.get<string>('OPENAI_TRANSCRIBE_MODEL') ||
      'gpt-4o-mini-transcribe';
    const file = await toFile(audio.buffer, audio.originalname, {
      type: audio.mimetype,
    });
    const transcription = await this.openai.audio.transcriptions.create({
      file,
      model,
      language: languageCode,
    });

    const text =
      typeof transcription === 'string'
        ? transcription
        : 'text' in transcription
          ? transcription.text
          : '';

    if (!text?.trim()) {
      throw new BadRequestException('Could not transcribe audio');
    }

    return text.trim();
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

  private assertOpenAiConfigured() {
    if (!this.configService.get<string>('OPENAI_API_KEY')) {
      throw new ServiceUnavailableException(
        'OpenAI is not configured. Set OPENAI_API_KEY in .env',
      );
    }
  }

  private assertSupportedAudio(audio: Express.Multer.File) {
    if (!SUPPORTED_TRANSCRIPTION_MIME_TYPES.has(audio.mimetype.toLowerCase())) {
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
}
