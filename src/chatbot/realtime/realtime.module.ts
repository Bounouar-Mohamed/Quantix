/**
 * Module Realtime pour Chatbot Voice
 */

import { Module } from '@nestjs/common';
import { RealtimeController } from './realtime.controller';
import { RealtimeService } from './realtime.service';
import { AiModule } from '../../ai/ai.module';

@Module({
    imports: [AiModule],
    controllers: [RealtimeController],
    providers: [RealtimeService],
    exports: [RealtimeService]
})
export class RealtimeModule {}

