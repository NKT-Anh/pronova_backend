import { Module } from '@nestjs/common';

import { AiAssessmentService } from './ai-assessment.service';

@Module({
  providers: [AiAssessmentService],
  exports: [AiAssessmentService],
})
export class AiAssessmentModule {}
