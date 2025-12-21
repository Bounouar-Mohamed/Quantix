import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { prisma, MODEL_PRICING, computeCost } from '../db/prisma';

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  // ═══════════════════════════════════════════════════════════════════════════════
  // CRUD TENANTS
  // ═══════════════════════════════════════════════════════════════════════════════

  async createTenant(data: {
    name: string;
    slug: string;
    email?: string;
    description?: string;
  }) {
    const tenant = await prisma.tenant.create({
      data: {
        name: data.name,
        slug: data.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        email: data.email,
        description: data.description,
        pricing: {
          create: {
            chatPricePerRequest: 0.01,
            chatPricePerToken: 0.001,
            realtimePricePerMinute: 0.10,
            realtimePricePerRequest: 0.05,
          },
        },
      },
      include: { pricing: true },
    });

    this.logger.log(`Tenant créé: ${tenant.name} (${tenant.slug})`);
    return tenant;
  }

  async updateTenant(id: string, data: {
    name?: string;
    email?: string;
    description?: string;
    active?: boolean;
  }) {
    return prisma.tenant.update({
      where: { id },
      data,
      include: { pricing: true },
    });
  }

  async getTenant(id: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: { pricing: true },
    });
    if (!tenant) throw new NotFoundException('Tenant non trouvé');
    return tenant;
  }

  async getTenantBySlug(slug: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { slug },
      include: { pricing: true },
    });
    if (!tenant) throw new NotFoundException('Tenant non trouvé');
    return tenant;
  }

  async listTenants() {
    return prisma.tenant.findMany({
      include: { pricing: true },
      orderBy: { name: 'asc' },
    });
  }

  async deleteTenant(id: string) {
    return prisma.tenant.delete({ where: { id } });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // PRICING
  // ═══════════════════════════════════════════════════════════════════════════════

  async updatePricing(tenantId: string, data: {
    chatPricePerRequest?: number;
    chatPricePerToken?: number;
    realtimePricePerMinute?: number;
    realtimePricePerRequest?: number;
    monthlyMinimum?: number;
    discountPercent?: number;
    maxRequestsPerDay?: number;
    maxTokensPerDay?: number;
    maxUsersAllowed?: number;
  }) {
    return prisma.tenantPricing.upsert({
      where: { tenantId },
      update: data,
      create: {
        tenantId,
        ...data,
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // USAGE & ANALYTICS
  // ═══════════════════════════════════════════════════════════════════════════════

  async getTenantUsage(tenantId: string, period?: string) {
    const currentPeriod = period || this.getCurrentPeriod();
    
    return prisma.tenantUsage.findUnique({
      where: {
        tenantId_period: { tenantId, period: currentPeriod },
      },
    });
  }

  async getTenantUsageHistory(tenantId: string, months = 12) {
    return prisma.tenantUsage.findMany({
      where: { tenantId },
      orderBy: { period: 'desc' },
      take: months,
    });
  }

  async getTenantUsers(tenantId: string) {
    return prisma.userUsage.findMany({
      where: { tenantId },
      orderBy: { lastSeen: 'desc' },
    });
  }

  async getTenantUserCount(tenantId: string) {
    const users = await prisma.userUsage.groupBy({
      by: ['userId'],
      where: { tenantId },
    });
    return users.length;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // AGGREGATION & BILLING
  // ═══════════════════════════════════════════════════════════════════════════════

  async aggregateTenantUsage(tenantId: string, period?: string) {
    const currentPeriod = period || this.getCurrentPeriod();
    const [startDate, endDate] = this.getPeriodDates(currentPeriod);

    // Récupérer les stats d'usage
    const userUsages = await prisma.userUsage.findMany({
      where: {
        tenantId,
        lastSeen: { gte: startDate, lte: endDate },
      },
    });

    const sessions = await prisma.sessionUsage.findMany({
      where: {
        tenantId,
        startAt: { gte: startDate, lte: endDate },
      },
    });

    // Calculer les métriques
    const chatStats = userUsages.filter(u => u.channel === 'chat');
    const realtimeStats = userUsages.filter(u => u.channel === 'realtime');

    const chatRequests = chatStats.reduce((sum, u) => sum + u.requests, 0);
    const chatTokensIn = chatStats.reduce((sum, u) => sum + u.tokensIn, 0);
    const chatTokensOut = chatStats.reduce((sum, u) => sum + u.tokensOut, 0);
    const chatTotalTokens = chatTokensIn + chatTokensOut;

    const realtimeRequests = realtimeStats.reduce((sum, u) => sum + u.requests, 0);
    const realtimeSessions = sessions.filter(s => s.channel === 'realtime');
    const realtimeMinutes = realtimeSessions.reduce((sum, s) => {
      const duration = s.durationMs || (s.endAt ? new Date(s.endAt).getTime() - new Date(s.startAt).getTime() : 0);
      return sum + (duration / 60000);
    }, 0);

    // Coût OpenAI
    const costOpenAI = chatStats.reduce((sum, u) => sum + u.totalCost, 0) +
                       realtimeStats.reduce((sum, u) => sum + u.totalCost, 0);

    // Récupérer le pricing du tenant
    const pricing = await prisma.tenantPricing.findUnique({ where: { tenantId } });
    
    // Calculer les revenus
    const revenueChat = pricing ? (
      (chatRequests * pricing.chatPricePerRequest) +
      (chatTotalTokens / 1000 * pricing.chatPricePerToken)
    ) : 0;

    const revenueRealtime = pricing ? (
      (realtimeRequests * pricing.realtimePricePerRequest) +
      (realtimeMinutes * pricing.realtimePricePerMinute)
    ) : 0;

    const revenueTotal = revenueChat + revenueRealtime;

    // Utilisateurs uniques
    const uniqueUserIds = new Set(userUsages.map(u => u.userId));

    // Upsert les stats
    return prisma.tenantUsage.upsert({
      where: {
        tenantId_period: { tenantId, period: currentPeriod },
      },
      update: {
        chatRequests,
        chatTokensIn,
        chatTokensOut,
        chatTotalTokens,
        realtimeRequests,
        realtimeMinutes,
        costOpenAI,
        revenueChat,
        revenueRealtime,
        revenueTotal,
        uniqueUsers: uniqueUserIds.size,
      },
      create: {
        tenantId,
        period: currentPeriod,
        chatRequests,
        chatTokensIn,
        chatTokensOut,
        chatTotalTokens,
        realtimeRequests,
        realtimeMinutes,
        costOpenAI,
        revenueChat,
        revenueRealtime,
        revenueTotal,
        uniqueUsers: uniqueUserIds.size,
      },
    });
  }

  async generateBilling(tenantId: string, period?: string) {
    const currentPeriod = period || this.getCurrentPeriod();
    
    // Agréger l'usage d'abord
    const usage = await this.aggregateTenantUsage(tenantId, currentPeriod);
    
    // Récupérer le pricing
    const pricing = await prisma.tenantPricing.findUnique({ where: { tenantId } });
    
    // Calculer la facturation
    const subtotal = usage.revenueTotal;
    const discount = pricing?.discountPercent ? subtotal * (pricing.discountPercent / 100) : 0;
    let total = subtotal - discount;
    
    // Appliquer le minimum mensuel
    if (pricing?.monthlyMinimum && total < pricing.monthlyMinimum) {
      total = pricing.monthlyMinimum;
    }
    
    const costOpenAI = usage.costOpenAI;
    const profit = total - costOpenAI;
    const margin = total > 0 ? (profit / total) * 100 : 0;

    return prisma.tenantBilling.upsert({
      where: {
        tenantId_period: { tenantId, period: currentPeriod },
      },
      update: {
        subtotal,
        discount,
        total,
        costOpenAI,
        profit,
        margin,
      },
      create: {
        tenantId,
        period: currentPeriod,
        subtotal,
        discount,
        total,
        costOpenAI,
        profit,
        margin,
      },
    });
  }

  async getTenantBilling(tenantId: string, period?: string) {
    const currentPeriod = period || this.getCurrentPeriod();
    return prisma.tenantBilling.findUnique({
      where: {
        tenantId_period: { tenantId, period: currentPeriod },
      },
    });
  }

  async getTenantBillingHistory(tenantId: string, months = 12) {
    return prisma.tenantBilling.findMany({
      where: { tenantId },
      orderBy: { period: 'desc' },
      take: months,
    });
  }

  async updateBillingStatus(billingId: string, status: 'pending' | 'invoiced' | 'paid' | 'overdue', invoiceRef?: string) {
    const data: any = { status };
    if (status === 'invoiced') {
      data.invoicedAt = new Date();
      if (invoiceRef) data.invoiceRef = invoiceRef;
    }
    if (status === 'paid') {
      data.paidAt = new Date();
    }
    return prisma.tenantBilling.update({
      where: { id: billingId },
      data,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // GLOBAL ANALYTICS
  // ═══════════════════════════════════════════════════════════════════════════════

  async getGlobalStats(period?: string) {
    const currentPeriod = period || this.getCurrentPeriod();

    const tenants = await prisma.tenant.findMany({
      where: { active: true },
      include: { pricing: true },
    });

    const usages = await prisma.tenantUsage.findMany({
      where: { period: currentPeriod },
    });

    const billings = await prisma.tenantBilling.findMany({
      where: { period: currentPeriod },
    });

    // Calculer les totaux
    const totalRevenue = billings.reduce((sum, b) => sum + b.total, 0);
    const totalCost = billings.reduce((sum, b) => sum + b.costOpenAI, 0);
    const totalProfit = billings.reduce((sum, b) => sum + b.profit, 0);
    const avgMargin = billings.length > 0 
      ? billings.reduce((sum, b) => sum + b.margin, 0) / billings.length 
      : 0;

    const totalRequests = usages.reduce((sum, u) => sum + u.chatRequests + u.realtimeRequests, 0);
    const totalTokens = usages.reduce((sum, u) => sum + u.chatTotalTokens, 0);
    const totalUsers = usages.reduce((sum, u) => sum + u.uniqueUsers, 0);

    return {
      period: currentPeriod,
      tenants: {
        total: tenants.length,
        active: tenants.filter(t => t.active).length,
      },
      usage: {
        totalRequests,
        totalTokens,
        totalUsers,
        chatRequests: usages.reduce((sum, u) => sum + u.chatRequests, 0),
        realtimeRequests: usages.reduce((sum, u) => sum + u.realtimeRequests, 0),
        realtimeMinutes: usages.reduce((sum, u) => sum + u.realtimeMinutes, 0),
      },
      financial: {
        totalRevenue,
        totalCost,
        totalProfit,
        avgMargin,
      },
    };
  }

  async getAllTenantsWithStats(period?: string) {
    const currentPeriod = period || this.getCurrentPeriod();

    const tenants = await prisma.tenant.findMany({
      include: { pricing: true },
      orderBy: { name: 'asc' },
    });

    const tenantsWithStats = await Promise.all(
      tenants.map(async (tenant) => {
        const usage = await prisma.tenantUsage.findUnique({
          where: { tenantId_period: { tenantId: tenant.id, period: currentPeriod } },
        });
        const billing = await prisma.tenantBilling.findUnique({
          where: { tenantId_period: { tenantId: tenant.id, period: currentPeriod } },
        });
        const userCount = await this.getTenantUserCount(tenant.id);

        return {
          ...tenant,
          userCount,
          currentUsage: usage,
          currentBilling: billing,
        };
      })
    );

    return tenantsWithStats;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════════

  private getCurrentPeriod(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  private getPeriodDates(period: string): [Date, Date] {
    const [year, month] = period.split('-').map(Number);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59, 999);
    return [start, end];
  }
}

