import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ConsumptionModule } from '../consumption/consumption.module';
import { AiService } from './ai.service';
import { aiConfig } from '../common/config/ai.config';
import { GenerationController } from './controllers/generation.controller';
import { HealthController } from './controllers/health.controller';
import { ModelsController } from './controllers/models.controller';
import { TestController } from './controllers/test.controller';
import { AssistantsController } from './controllers/assistants.controller';
import { AssistantsService } from './services/assistants.service';
import { BackendConversationsClient } from './services/backend-conversations.client';
import { ConversationSyncService } from './services/conversation-sync.service';

@Module({
  imports: [
    ConfigModule.forFeature(aiConfig),
    ConsumptionModule,
  ],
  controllers: [
    GenerationController,
    HealthController,
    ModelsController,
    TestController,
    AssistantsController,
  ],
  providers: [
    AiService,
    AssistantsService,
    BackendConversationsClient,
    ConversationSyncService,
  ],
  exports: [AiService, AssistantsService],
})
export class AiModule {}
