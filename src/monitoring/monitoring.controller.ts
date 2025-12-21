import {
  Controller,
  Get,
  Query,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { MonitoringService } from './monitoring.service';
import { prisma } from '../db/prisma';

@ApiTags('monitoring')
@Controller('monitoring')
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  @Get('stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Statistiques globales',
    description: 'Récupère les statistiques globales du microservice',
  })
  @ApiResponse({
    status: 200,
    description: 'Statistiques globales',
  })
  getGlobalStats() {
    return this.monitoringService.getGlobalStats();
  }

  @Get('user/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Statistiques d un utilisateur',
    description: 'Récupère les statistiques d un utilisateur spécifique',
  })
  @ApiResponse({
    status: 200,
    description: 'Statistiques utilisateur',
  })
  getUserStats(@Param('userId') userId: string) {
    return this.monitoringService.getUserStats(userId);
  }

  @Get('users')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Liste des utilisateurs actifs',
    description: 'Récupère la liste des utilisateurs avec leurs statistiques',
  })
  @ApiResponse({
    status: 200,
    description: 'Liste des utilisateurs',
  })
  getActiveUsers(@Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit, 10) : 100;
    return this.monitoringService.getActiveUsers(limitNum);
  }

  @Get('endpoint/:endpoint')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Statistiques d un endpoint',
    description: 'Récupère les statistiques d un endpoint spécifique',
  })
  @ApiResponse({
    status: 200,
    description: 'Statistiques endpoint',
  })
  getEndpointStats(@Param('endpoint') endpoint: string) {
    return this.monitoringService.getEndpointStats(decodeURIComponent(endpoint));
  }

  @Get('endpoint')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Statistiques d un endpoint (via query)',
    description: 'Récupère les statistiques d un endpoint via query parameter',
  })
  getEndpointStatsQuery(@Query('name') name: string) {
    return this.monitoringService.getEndpointStats(name);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // ENDPOINTS POUR LES DONNÉES PERSISTANTES (BASE DE DONNÉES)
  // ═══════════════════════════════════════════════════════════════════════════════

  @Get('db/usage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Usage par utilisateur (DB)',
    description: 'Récupère les données de consommation depuis la base de données avec info client',
  })
  async getDbUsage(@Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    
    const usage = await prisma.userUsage.findMany({
      orderBy: { lastSeen: 'desc' },
      take: limitNum,
    });

    // Récupérer les infos des tenants
    const tenantIds = [...new Set(usage.map(u => u.tenantId).filter(Boolean))];
    const tenants = await prisma.tenant.findMany({
      where: { id: { in: tenantIds as string[] } },
      include: { pricing: true },
    });
    const tenantMap = new Map(tenants.map(t => [t.id, t]));

    return usage.map(u => {
      const tenant = u.tenantId ? tenantMap.get(u.tenantId) : null;
      const pricing = tenant?.pricing;
      
      // Calculer le revenu par utilisateur selon le modèle de facturation
      let revenuePerUser = 0;
      if (pricing) {
        if (pricing.billingModel === 'per_user') {
          revenuePerUser = pricing.pricePerUser; // $200 par user
        } else if (pricing.billingModel === 'per_request') {
          revenuePerUser = u.requests * pricing.chatPricePerRequest;
        } else if (pricing.billingModel === 'per_token') {
          revenuePerUser = (u.totalTokens / 1000) * pricing.chatPricePerToken * 1000;
        }
      }
      
      return {
        ...u,
        tenant: tenant ? {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
        } : null,
        pricing: pricing ? {
          billingModel: pricing.billingModel,
          pricePerUser: pricing.pricePerUser,
        } : null,
        revenuePerUser: +revenuePerUser.toFixed(2),
      };
    });
  }

  @Get('db/usage/by-tenant')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Usage agrégé par client',
    description: 'Récupère la consommation totale groupée par client/tenant avec calcul des coûts réels',
  })
  async getDbUsageByTenant() {
    // Récupérer tous les tenants avec leur pricing
    const tenants = await prisma.tenant.findMany({
      include: { pricing: true },
    });

    // Récupérer l'usage agrégé par tenant
    const results = await Promise.all(tenants.map(async (tenant) => {
      const usage = await prisma.userUsage.aggregate({
        where: { tenantId: tenant.id },
        _sum: {
          requests: true,
          tokensIn: true,
          tokensOut: true,
          totalTokens: true,
          totalCost: true, // Coût OpenAI
        },
        _count: {
          userId: true,
        },
      });

      // Compter les utilisateurs UNIQUES (pas les records)
      const uniqueUsersResult = await prisma.userUsage.findMany({
        where: { tenantId: tenant.id },
        select: { userId: true },
        distinct: ['userId'],
      });
      const uniqueUsers = uniqueUsersResult.length;

      const totalRequests = usage._sum.requests || 0;
      const totalTokens = usage._sum.totalTokens || 0;
      const costOpenAI = usage._sum.totalCost || 0;

      // ═══════════════════════════════════════════════════════════════════════════════
      // CALCUL DU REVENU selon le modèle de facturation
      // ═══════════════════════════════════════════════════════════════════════════════
      let revenue = 0;
      const pricing = tenant.pricing;
      
      if (pricing) {
        switch (pricing.billingModel) {
          case 'per_user':
            // Facturation par utilisateur: $X par utilisateur actif
            revenue = uniqueUsers * pricing.pricePerUser;
            break;
          case 'flat':
            // Forfait mensuel fixe
            revenue = pricing.flatMonthlyFee;
            break;
          case 'per_request':
            // Facturation par requête
            revenue = totalRequests * pricing.chatPricePerRequest;
            break;
          case 'per_token':
            // Facturation par token
            revenue = (totalTokens / 1000) * pricing.chatPricePerToken * 1000;
            break;
          default:
            // Par défaut: per_user
            revenue = uniqueUsers * (pricing.pricePerUser || 200);
        }
        
        // Appliquer le minimum mensuel si défini
        if (pricing.monthlyMinimum && revenue < pricing.monthlyMinimum) {
          revenue = pricing.monthlyMinimum;
        }
        
        // Appliquer la remise si définie
        if (pricing.discountPercent > 0) {
          revenue = revenue * (1 - pricing.discountPercent / 100);
        }
      }

      return {
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          email: tenant.email,
          active: tenant.active,
        },
        pricing: pricing ? {
          billingModel: pricing.billingModel,
          pricePerUser: pricing.pricePerUser,
          flatMonthlyFee: pricing.flatMonthlyFee,
          chatPricePerRequest: pricing.chatPricePerRequest,
          chatPricePerToken: pricing.chatPricePerToken,
          realtimePricePerMinute: pricing.realtimePricePerMinute,
          monthlyMinimum: pricing.monthlyMinimum,
          discountPercent: pricing.discountPercent,
        } : null,
        usage: {
          uniqueUsers,
          totalRequests,
          tokensIn: usage._sum.tokensIn || 0,
          tokensOut: usage._sum.tokensOut || 0,
          totalTokens,
        },
        financials: {
          costOpenAI: +costOpenAI.toFixed(4),
          revenue: +revenue.toFixed(2),
          profit: +(revenue - costOpenAI).toFixed(2),
          margin: revenue > 0 ? +((revenue - costOpenAI) / revenue * 100).toFixed(2) : 0,
        },
      };
    }));

    // Totaux globaux
    const totals = results.reduce((acc, r) => ({
      totalUsers: acc.totalUsers + r.usage.uniqueUsers,
      totalRequests: acc.totalRequests + r.usage.totalRequests,
      totalTokens: acc.totalTokens + r.usage.totalTokens,
      totalCostOpenAI: acc.totalCostOpenAI + r.financials.costOpenAI,
      totalRevenue: acc.totalRevenue + r.financials.revenue,
      totalProfit: acc.totalProfit + r.financials.profit,
    }), { totalUsers: 0, totalRequests: 0, totalTokens: 0, totalCostOpenAI: 0, totalRevenue: 0, totalProfit: 0 });

    return {
      tenants: results,
      totals: {
        ...totals,
        globalMargin: totals.totalRevenue > 0 
          ? +((totals.totalProfit / totals.totalRevenue) * 100).toFixed(2)
          : 0,
      },
    };
  }

  @Get('db/sessions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sessions récentes (DB)',
    description: 'Récupère les sessions récentes depuis la base de données',
  })
  async getDbSessions(@Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit, 10) : 20;
    
    return prisma.sessionUsage.findMany({
      orderBy: { startAt: 'desc' },
      take: limitNum,
    });
  }
}


