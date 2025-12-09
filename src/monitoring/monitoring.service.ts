import { Injectable, Logger } from '@nestjs/common';

export interface RequestMetric {
  userId: string;
  endpoint: string;
  timestamp: Date;
  tokensUsed: number;
  duration: number;
  success: boolean;
  error?: string;
}

export interface UserStats {
  userId: string;
  totalRequests: number;
  totalTokens: number;
  requestsByEndpoint: Record<string, number>;
  lastRequest: Date;
}

@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);
  private metrics: RequestMetric[] = [];
  private maxMetrics = 10000; // Conserver les 10k dernières requêtes

  /**
   * Enregistre une requête
   */
  logRequest(
    userId: string,
    endpoint: string,
    tokensUsed: number,
    duration: number,
    success: boolean,
    error?: string,
  ): void {
    const metric: RequestMetric = {
      userId,
      endpoint,
      timestamp: new Date(),
      tokensUsed,
      duration,
      success,
      error,
    };

    this.metrics.push(metric);

    // Limiter le nombre de métriques en mémoire
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }

    this.logger.debug(
      `📊 Métrique enregistrée: ${userId} → ${endpoint} (${tokensUsed} tokens, ${duration}ms)`,
    );
  }

  /**
   * Récupère les statistiques d'un utilisateur
   */
  getUserStats(userId: string): UserStats {
    const userMetrics = this.metrics.filter((m) => m.userId === userId);

    if (userMetrics.length === 0) {
      return {
        userId,
        totalRequests: 0,
        totalTokens: 0,
        requestsByEndpoint: {},
        lastRequest: new Date(),
      };
    }

    const requestsByEndpoint: Record<string, number> = {};
    let totalTokens = 0;

    userMetrics.forEach((metric) => {
      totalTokens += metric.tokensUsed;
      requestsByEndpoint[metric.endpoint] =
        (requestsByEndpoint[metric.endpoint] || 0) + 1;
    });

    return {
      userId,
      totalRequests: userMetrics.length,
      totalTokens,
      requestsByEndpoint,
      lastRequest: userMetrics[userMetrics.length - 1].timestamp,
    };
  }

  /**
   * Récupère les statistiques globales
   */
  getGlobalStats() {
    const uniqueUsers = new Set(this.metrics.map((m) => m.userId));
    const totalRequests = this.metrics.length;
    const totalTokens = this.metrics.reduce((sum, m) => sum + m.tokensUsed, 0);
    const successfulRequests = this.metrics.filter((m) => m.success).length;
    const failedRequests = this.metrics.filter((m) => !m.success).length;

    // Statistiques par endpoint
    const requestsByEndpoint: Record<string, number> = {};
    const tokensByEndpoint: Record<string, number> = {};

    this.metrics.forEach((metric) => {
      requestsByEndpoint[metric.endpoint] =
        (requestsByEndpoint[metric.endpoint] || 0) + 1;
      tokensByEndpoint[metric.endpoint] =
        (tokensByEndpoint[metric.endpoint] || 0) + metric.tokensUsed;
    });

    return {
      uniqueUsers: uniqueUsers.size,
      totalRequests,
      totalTokens,
      successfulRequests,
      failedRequests,
      successRate: (successfulRequests / totalRequests) * 100 || 0,
      avgTokensPerRequest: totalRequests > 0 ? totalTokens / totalRequests : 0,
      requestsByEndpoint,
      tokensByEndpoint,
      lastRequest: this.metrics[this.metrics.length - 1]?.timestamp || new Date(),
    };
  }

  /**
   * Liste tous les utilisateurs actifs
   */
  getActiveUsers(limit = 100) {
    const userStats = new Map<string, UserStats>();

    this.metrics.forEach((metric) => {
      if (!userStats.has(metric.userId)) {
        userStats.set(metric.userId, this.getUserStats(metric.userId));
      }
    });

    return Array.from(userStats.values())
      .sort((a, b) => b.totalRequests - a.totalRequests)
      .slice(0, limit);
  }

  /**
   * Statistiques pour un endpoint spécifique
   */
  getEndpointStats(endpoint: string) {
    const endpointMetrics = this.metrics.filter((m) => m.endpoint === endpoint);

    if (endpointMetrics.length === 0) {
      return {
        endpoint,
        totalRequests: 0,
        totalTokens: 0,
        avgDuration: 0,
        successRate: 0,
        uniqueUsers: 0,
      };
    }

    const totalTokens = endpointMetrics.reduce(
      (sum, m) => sum + m.tokensUsed,
      0,
    );
    const avgDuration =
      endpointMetrics.reduce((sum, m) => sum + m.duration, 0) /
      endpointMetrics.length;
    const successRate =
      (endpointMetrics.filter((m) => m.success).length /
        endpointMetrics.length) *
      100;

    const uniqueUsers = new Set(
      endpointMetrics.map((m) => m.userId),
    ).size;

    return {
      endpoint,
      totalRequests: endpointMetrics.length,
      totalTokens,
      avgDuration,
      successRate,
      uniqueUsers,
    };
  }

  /**
   * Nettoie les anciennes métriques
   */
  clearOldMetrics(olderThanMinutes = 60) {
    const cutoff = new Date(
      Date.now() - olderThanMinutes * 60 * 1000,
    );
    const initialLength = this.metrics.length;
    this.metrics = this.metrics.filter((m) => m.timestamp > cutoff);
    const removed = initialLength - this.metrics.length;

    if (removed > 0) {
      this.logger.log(`🧹 Supprimé ${removed} anciennes métriques`);
    }
  }
}


