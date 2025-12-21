import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { BillingCronService } from './billing-cron.service';

@Module({
  controllers: [TenantsController],
  providers: [TenantsService, BillingCronService],
  exports: [TenantsService, BillingCronService],
})
export class TenantsModule {}

