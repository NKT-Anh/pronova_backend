import { Module } from '@nestjs/common';
import { TextItemController } from './text-item.controller';
import { TextItemService } from './text-item.service';

@Module({
  controllers: [TextItemController],
  providers: [TextItemService],
  exports: [TextItemService],
})
export class TextItemModule {}
