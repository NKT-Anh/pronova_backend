import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { TextToSpeechModule } from '../text-to-speech/text-to-speech.module';

@Module({
  imports: [TextToSpeechModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
