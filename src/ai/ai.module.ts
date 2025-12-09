import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiService } from './ai.service';
import { aiConfig } from '../common/config/ai.config';
import { GenerationController } from './controllers/generation.controller';
import { HealthController } from './controllers/health.controller';
import { ModelsController } from './controllers/models.controller';
import { TestController } from './controllers/test.controller';
import { AssistantsController } from './controllers/assistants.controller';
import { AssistantsService } from './services/assistants.service';

@Module({
  imports: [
    ConfigModule.forFeature(aiConfig),
  ],
  controllers: [
    GenerationController,
    HealthController,
    ModelsController,
    TestController,
    AssistantsController,
  ],
  providers: [AiService, AssistantsService],
  exports: [AiService, AssistantsService],
})
export class AiModule {}
