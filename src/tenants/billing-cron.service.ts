import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { prisma } from '../db/prisma';

/**
 * Service de planification pour l'agrégation automatique
 * et la génération de factures
 */
@Injectable()
export class BillingCronService implements OnModuleInit {
  private readonly logger = new Logger(BillingCronService.name);
  private aggregationInterval: NodeJS.Timeout | null = null;

  constructor(private readonly tenantsService: TenantsService) {}

  onModuleInit() {
    this.startScheduledJobs();
    this.logger.log('🕐 Service de facturation automatique démarré');
  }

  /**
   * Démarre les jobs planifiés
   */
  private startScheduledJobs() {
    // Agrégation toutes les heures
    this.aggregationInterval = setInterval(
      () => this.runHourlyAggregation(),
      60 * 60 * 1000 // 1 heure
    );

    // Vérifier si c'est le premier jour du mois pour générer les factures
    this.scheduleMonthlyBilling();

    // Exécuter une première agrégation au démarrage
    setTimeout(() => this.runHourlyAggregation(), 10000);
  }

  /**
   * Agrégation horaire de tous les tenants
   */
  async runHourlyAggregation() {
    try {
      const tenants = await prisma.tenant.findMany({
        where: { active: true },
        select: { id: true, name: true },
      });

      this.logger.log(`📊 Agrégation horaire: ${tenants.length} tenants`);

      for (const tenant of tenants) {
        try {
          await this.tenantsService.aggregateTenantUsage(tenant.id);
          this.logger.debug(`   ✓ ${tenant.name} agrégé`);
        } catch (error: any) {
          this.logger.error(`   ✗ ${tenant.name}: ${error.message}`);
        }
      }

      this.logger.log(`✅ Agrégation horaire terminée`);
    } catch (error: any) {
      this.logger.error(`Erreur agrégation horaire: ${error.message}`);
    }
  }

  /**
   * Planifie la génération mensuelle des factures
   */
  private scheduleMonthlyBilling() {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 2, 0, 0); // 2h du matin le 1er
    const msUntilNextMonth = nextMonth.getTime() - now.getTime();

    this.logger.log(`📅 Prochaine facturation automatique: ${nextMonth.toISOString()}`);

    setTimeout(() => {
      this.runMonthlyBilling();
      // Replanifier pour le mois suivant
      setInterval(() => this.runMonthlyBilling(), 30 * 24 * 60 * 60 * 1000); // ~30 jours
    }, msUntilNextMonth);
  }

  /**
   * Génération mensuelle des factures
   */
  async runMonthlyBilling() {
    try {
      // Calculer la période précédente
      const now = new Date();
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const period = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;

      const tenants = await prisma.tenant.findMany({
        where: { active: true },
        select: { id: true, name: true },
      });

      this.logger.log(`📄 Génération factures ${period}: ${tenants.length} tenants`);

      for (const tenant of tenants) {
        try {
          const billing = await this.tenantsService.generateBilling(tenant.id, period);
          this.logger.log(`   ✓ ${tenant.name}: €${billing.total.toFixed(2)} (profit: €${billing.profit.toFixed(2)})`);
        } catch (error: any) {
          this.logger.error(`   ✗ ${tenant.name}: ${error.message}`);
        }
      }

      this.logger.log(`✅ Facturation ${period} terminée`);
    } catch (error: any) {
      this.logger.error(`Erreur facturation mensuelle: ${error.message}`);
    }
  }

  /**
   * Force l'agrégation immédiate (pour appel manuel ou API)
   */
  async forceAggregation() {
    this.logger.log('🔄 Agrégation forcée demandée');
    await this.runHourlyAggregation();
    return { success: true, timestamp: new Date().toISOString() };
  }

  /**
   * Force la génération de factures (pour appel manuel ou API)
   */
  async forceBilling(period?: string) {
    this.logger.log(`🔄 Facturation forcée demandée (période: ${period || 'courante'})`);
    
    const tenants = await prisma.tenant.findMany({
      where: { active: true },
      select: { id: true, name: true },
    });

    const results = [];
    for (const tenant of tenants) {
      try {
        const billing = await this.tenantsService.generateBilling(tenant.id, period);
        results.push({ tenant: tenant.name, success: true, total: billing.total, profit: billing.profit });
      } catch (error: any) {
        results.push({ tenant: tenant.name, success: false, error: error.message });
      }
    }

    return { success: true, results, timestamp: new Date().toISOString() };
  }
}

