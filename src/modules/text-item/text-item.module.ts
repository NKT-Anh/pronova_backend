import { Module } from '@nestjs/common';
import { TextItemController } from './text-item.controller';
import { TextItemService } from './text-item.service';
import { TextToSpeechModule } from '../text-to-speech/text-to-speech.module';

@Module({
  imports: [TextToSpeechModule],
  controllers: [TextItemController],
  providers: [TextItemService],
  exports: [TextItemService],
})
export class TextItemModule {}
