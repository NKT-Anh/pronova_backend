import { Global, Module } from '@nestjs/common';
import { GeminiConfigService } from './gemini-config.service';

@Global()
@Module({
  providers: [GeminiConfigService],
  exports: [GeminiConfigService],
})
export class GeminiConfigModule {}
