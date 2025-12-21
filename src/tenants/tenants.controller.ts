import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { BillingCronService } from './billing-cron.service';

@ApiTags('tenants')
@Controller('tenants')
export class TenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly billingCronService: BillingCronService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════════
  // CRUD TENANTS
  // ═══════════════════════════════════════════════════════════════════════════════

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Liste tous les tenants' })
  async listTenants() {
    return this.tenantsService.listTenants();
  }

  @Get('stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Statistiques globales tous tenants' })
  async getGlobalStats(@Query('period') period?: string) {
    return this.tenantsService.getGlobalStats(period);
  }

  @Get('all-with-stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Liste tous les tenants avec leurs stats' })
  async getAllTenantsWithStats(@Query('period') period?: string) {
    return this.tenantsService.getAllTenantsWithStats(period);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Créer un nouveau tenant' })
  async createTenant(
    @Body() body: { name: string; slug: string; email?: string; description?: string }
  ) {
    return this.tenantsService.createTenant(body);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Récupérer un tenant par ID' })
  async getTenant(@Param('id') id: string) {
    return this.tenantsService.getTenant(id);
  }

  @Get('slug/:slug')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Récupérer un tenant par slug' })
  async getTenantBySlug(@Param('slug') slug: string) {
    return this.tenantsService.getTenantBySlug(slug);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mettre à jour un tenant' })
  async updateTenant(
    @Param('id') id: string,
    @Body() body: { name?: string; email?: string; description?: string; active?: boolean }
  ) {
    return this.tenantsService.updateTenant(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Supprimer un tenant' })
  async deleteTenant(@Param('id') id: string) {
    return this.tenantsService.deleteTenant(id);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // PRICING
  // ═══════════════════════════════════════════════════════════════════════════════

  @Put(':id/pricing')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mettre à jour les tarifs d\'un tenant' })
  async updatePricing(
    @Param('id') id: string,
    @Body() body: {
      chatPricePerRequest?: number;
      chatPricePerToken?: number;
      realtimePricePerMinute?: number;
      realtimePricePerRequest?: number;
      monthlyMinimum?: number;
      discountPercent?: number;
      maxRequestsPerDay?: number;
      maxTokensPerDay?: number;
      maxUsersAllowed?: number;
    }
  ) {
    return this.tenantsService.updatePricing(id, body);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // USAGE & ANALYTICS
  // ═══════════════════════════════════════════════════════════════════════════════

  @Get(':id/usage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Consommation du tenant pour une période' })
  async getTenantUsage(
    @Param('id') id: string,
    @Query('period') period?: string
  ) {
    return this.tenantsService.getTenantUsage(id, period);
  }

  @Get(':id/usage/history')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Historique de consommation du tenant' })
  async getTenantUsageHistory(
    @Param('id') id: string,
    @Query('months') months?: string
  ) {
    return this.tenantsService.getTenantUsageHistory(id, months ? parseInt(months) : 12);
  }

  @Get(':id/users')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Liste des utilisateurs du tenant' })
  async getTenantUsers(@Param('id') id: string) {
    return this.tenantsService.getTenantUsers(id);
  }

  @Post(':id/usage/aggregate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Agréger la consommation du tenant' })
  async aggregateTenantUsage(
    @Param('id') id: string,
    @Query('period') period?: string
  ) {
    return this.tenantsService.aggregateTenantUsage(id, period);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // BILLING
  // ═══════════════════════════════════════════════════════════════════════════════

  @Get(':id/billing')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Facturation du tenant pour une période' })
  async getTenantBilling(
    @Param('id') id: string,
    @Query('period') period?: string
  ) {
    return this.tenantsService.getTenantBilling(id, period);
  }

  @Get(':id/billing/history')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Historique de facturation du tenant' })
  async getTenantBillingHistory(
    @Param('id') id: string,
    @Query('months') months?: string
  ) {
    return this.tenantsService.getTenantBillingHistory(id, months ? parseInt(months) : 12);
  }

  @Post(':id/billing/generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Générer la facturation du tenant' })
  async generateBilling(
    @Param('id') id: string,
    @Query('period') period?: string
  ) {
    return this.tenantsService.generateBilling(id, period);
  }

  @Put('billing/:billingId/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mettre à jour le statut de facturation' })
  async updateBillingStatus(
    @Param('billingId') billingId: string,
    @Body() body: { status: 'pending' | 'invoiced' | 'paid' | 'overdue'; invoiceRef?: string }
  ) {
    return this.tenantsService.updateBillingStatus(billingId, body.status, body.invoiceRef);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // AUTOMATION / CRON
  // ═══════════════════════════════════════════════════════════════════════════════

  @Post('cron/aggregate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Force l\'agrégation de tous les tenants' })
  async forceAggregation() {
    return this.billingCronService.forceAggregation();
  }

  @Post('cron/billing')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Force la génération de factures pour tous les tenants' })
  async forceBilling(@Query('period') period?: string) {
    return this.billingCronService.forceBilling(period);
  }
}

