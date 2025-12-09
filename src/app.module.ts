import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';

// Modules métier
import { AiModule } from './ai/ai.module';
import { ConsumptionModule } from './consumption/consumption.module';
import { UsersModule } from './users/users.module';
import { AutomationModule } from './automation/automation.module';
import { DatabaseModule } from './database/database.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { RealtimeModule } from './chatbot/realtime/realtime.module';

// Configuration
import { aiConfig } from './common/config/ai.config';
import { databaseConfig } from './common/config/database.config';

@Module({
  imports: [
    // Configuration globale
    ConfigModule.forRoot({
      isGlobal: true,
      load: [aiConfig, databaseConfig],
      envFilePath: ['.env.local', '.env'],
    }),

    // Rate limiting
    ThrottlerModule.forRoot([{
      ttl: 60000, // 1 minute
      limit: 100, // 100 requêtes par minute
    }]),

    // Modules métier
    AiModule,
    ConsumptionModule,
    UsersModule,
    AutomationModule,
    DatabaseModule,
    MonitoringModule,
    RealtimeModule,
  ],
})
export class AppModule {}
