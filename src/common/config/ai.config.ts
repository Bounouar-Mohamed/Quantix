import { registerAs } from '@nestjs/config';

export const aiConfig = registerAs('ai', () => ({
  // Configuration OpenAI
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    defaultModel: process.env.OPENAI_DEFAULT_MODEL || 'gpt-3.5-turbo',
    maxTokens: Number(process.env.OPENAI_MAX_TOKENS) || 1000,
    temperature: Number(process.env.OPENAI_TEMPERATURE) || 0.7,
    timeout: Number(process.env.OPENAI_TIMEOUT) || 30000,
  },

  // Configuration Anthropic
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    baseUrl: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1',
    defaultModel: process.env.ANTHROPIC_DEFAULT_MODEL || 'claude-3-sonnet-20240229',
    maxTokens: Number(process.env.ANTHROPIC_MAX_TOKENS) || 1000,
    temperature: Number(process.env.ANTHROPIC_TEMPERATURE) || 0.7,
    timeout: Number(process.env.ANTHROPIC_TIMEOUT) || 30000,
  },

  // Configuration générale
  defaultProvider: process.env.AI_DEFAULT_PROVIDER || 'openai',
  maxRetries: Number(process.env.AI_MAX_RETRIES) || 3,
  retryDelay: Number(process.env.AI_RETRY_DELAY) || 1000,
  
  // Limites globales
  globalLimits: {
    requestsPerMinute: Number(process.env.AI_REQUESTS_PER_MINUTE) || 60,
    tokensPerMinute: Number(process.env.AI_TOKENS_PER_MINUTE) || 100000,
    costPerDay: Number(process.env.AI_COST_PER_DAY) || 100,
  },
}));
