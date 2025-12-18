/**
 * Module Realtime pour Chatbot Voice
 */

import { Module } from '@nestjs/common';
import { RealtimeController } from './realtime.controller';
import { RealtimeService } from './realtime.service';
import { AiModule } from '../../ai/ai.module';
import { ConsumptionModule } from '../../consumption/consumption.module';

@Module({
    imports: [AiModule, ConsumptionModule],
    controllers: [RealtimeController],
    providers: [RealtimeService],
    exports: [RealtimeService]
})
export class RealtimeModule {}

