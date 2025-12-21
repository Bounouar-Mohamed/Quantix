import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

// Modules métier
import { AiModule } from './ai/ai.module';
import { ConsumptionModule } from './consumption/consumption.module';
import { UsersModule } from './users/users.module';
import { AutomationModule } from './automation/automation.module';
import { DatabaseModule } from './database/database.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { RealtimeModule } from './chatbot/realtime/realtime.module';
import { TenantsModule } from './tenants/tenants.module';

// Configuration
import { aiConfig } from './common/config/ai.config';
import { databaseConfig } from './common/config/database.config';
import { InternalApiGuard } from './common/guards/internal-api.guard';

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
    TenantsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: InternalApiGuard,
    },
  ],
})
export class AppModule {}
