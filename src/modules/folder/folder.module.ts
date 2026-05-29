import { Module } from '@nestjs/common';
import { FolderController } from './folder.controller';
import { FolderService } from './folder.service';
import { TextItemModule } from '../text-item/text-item.module';

@Module({
  imports: [TextItemModule],
  controllers: [FolderController],
  providers: [FolderService],
})
export class FolderModule {}
