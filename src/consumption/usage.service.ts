import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { MonitoringService } from '../monitoring/monitoring.service';
import { logUserUsage } from './logger';

type Channel = 'chat' | 'realtime';

type DailyUsage = {
  date: string;
  requests: number;
  tokens: number;
};

type RecordUsageParams = {
  userId: string;
  tenantId?: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  durationMs: number;
  endpoint: string;
  success: boolean;
  error?: string;
};

type RealtimeUsageParams = {
  userId: string;
  tenantId?: string;
  model: string;
  durationMs: number;
  endpoint: string;
  success: boolean;
  error?: string;
};

@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);
  private readonly dailyCounters = new Map<string, DailyUsage>();

  private readonly quotas = {
    chat: {
      maxRequests: Number(process.env.CHAT_MAX_REQUESTS_PER_DAY || 1000),
      maxTokens: Number(process.env.CHAT_MAX_TOKENS_PER_DAY || 500000),
    },
    realtime: {
      maxRequests: Number(process.env.REALTIME_MAX_REQUESTS_PER_DAY || 500),
    },
  };

  constructor(private readonly monitoringService: MonitoringService) {}

  async recordChatUsage(params: RecordUsageParams): Promise<void> {
    const promptTokens = params.promptTokens ?? 0;
    const completionTokens = params.completionTokens ?? 0;

    await logUserUsage({
      userId: params.userId,
      tenantId: params.tenantId,
      channel: 'chat',
      model: params.model,
      promptTokens,
      completionTokens,
    });

    this.monitoringService.logRequest(
      params.userId,
      params.endpoint,
      promptTokens + completionTokens,
      params.durationMs,
      params.success,
      params.error,
    );

    this.enforceQuota(params.userId, 'chat', promptTokens + completionTokens);
  }

  async recordRealtimeUsage(params: RealtimeUsageParams): Promise<void> {
    await logUserUsage({
      userId: params.userId,
      tenantId: params.tenantId,
      channel: 'realtime',
      model: params.model,
      promptTokens: 0,
      completionTokens: 0,
    });

    this.monitoringService.logRequest(
      params.userId,
      params.endpoint,
      0,
      params.durationMs,
      params.success,
      params.error,
    );

    this.enforceQuota(params.userId, 'realtime', 0);
  }

  private enforceQuota(userId: string, channel: Channel, tokensUsed: number): void {
    const today = new Date().toISOString().slice(0, 10);
    const key = `${channel}:${userId}`;
    const quota =
      channel === 'chat'
        ? this.quotas.chat
        : this.quotas.realtime;

    if (!quota) {
      return;
    }

    const counter = this.dailyCounters.get(key);
    if (!counter || counter.date !== today) {
      this.dailyCounters.set(key, { date: today, requests: 0, tokens: 0 });
    }

    const current = this.dailyCounters.get(key)!;
    current.requests += 1;
    current.tokens += tokensUsed;

    if (quota.maxRequests && current.requests > quota.maxRequests) {
      this.logger.warn(
        `Quota requêtes dépassé pour ${userId} (${channel}): ${current.requests}/${quota.maxRequests}`,
      );
      throw new HttpException('Quota quotidien de requêtes dépassé', HttpStatus.TOO_MANY_REQUESTS);
    }

    if (channel === 'chat' && quota.maxTokens && current.tokens > quota.maxTokens) {
      this.logger.warn(
        `Quota tokens dépassé pour ${userId}: ${current.tokens}/${quota.maxTokens}`,
      );
      throw new HttpException('Quota quotidien de tokens dépassé', HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}

