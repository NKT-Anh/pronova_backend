import { Module } from '@nestjs/common';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';
import { MailService } from './mail.service';

@Module({
  controllers: [SupportController],
  providers: [SupportService, MailService],
  exports: [MailService],
})
export class SupportModule {}
