import { Module } from '@nestjs/common';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { UsageService } from './usage.service';

@Module({
  imports: [MonitoringModule],
  providers: [UsageService],
  exports: [UsageService],
})
export class ConsumptionModule {}
