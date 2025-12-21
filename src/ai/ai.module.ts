/**
 * ══════════════════════════════════════════════════════════════════════════════
 * AI MODULE - Module IA simplifié
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ConsumptionModule } from '../consumption/consumption.module';
import { aiConfig } from '../common/config/ai.config';

// Services
import { AiService } from './ai.service';
import { AssistantsService } from './services/assistants.service';
import { InstructionsService } from './services/instructions.service';
import { BackendConversationsClient } from './services/backend-conversations.client';
import { ConversationSyncService } from './services/conversation-sync.service';

// Controllers
import { GenerationController } from './controllers/generation.controller';
import { HealthController } from './controllers/health.controller';
import { ModelsController } from './controllers/models.controller';
import { TestController } from './controllers/test.controller';
import { AssistantsController } from './controllers/assistants.controller';
import { InstructionsController } from './controllers/instructions.controller';

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
    InstructionsController,
  ],
  providers: [
    AiService,
    AssistantsService,
    InstructionsService,
    BackendConversationsClient,
    ConversationSyncService,
  ],
  exports: [AiService, AssistantsService, InstructionsService],
})
export class AiModule {}
