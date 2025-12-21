import { registerAs } from '@nestjs/config';

/**
 * Configuration OpenAI centralisée
 * Supporte Chat (gpt-4o-mini) et Realtime (gpt-4o-realtime-preview)
 */
export const aiConfig = registerAs('ai', () => ({
  // Configuration OpenAI
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    // Modèles
    chatModel: process.env.OPENAI_MODEL_TEXT || 'gpt-4o-mini',
    realtimeModel: process.env.OPENAI_MODEL_REALTIME || 'gpt-4o-realtime-preview',
    // Paramètres par défaut
    maxTokens: Number(process.env.OPENAI_MAX_TOKENS) || 2000,
    temperature: Number(process.env.OPENAI_TEMPERATURE) || 0.7,
    timeout: Number(process.env.OPENAI_TIMEOUT) || 30000,
    // Realtime spécifique
    realtimeVoice: process.env.OPENAI_REALTIME_VOICE || 'shimmer',
  },

  // Limites et retry
  maxRetries: Number(process.env.AI_MAX_RETRIES) || 3,
  retryDelay: Number(process.env.AI_RETRY_DELAY) || 1000,
  
  // Limites globales
  limits: {
    requestsPerMinute: Number(process.env.AI_REQUESTS_PER_MINUTE) || 60,
    tokensPerMinute: Number(process.env.AI_TOKENS_PER_MINUTE) || 100000,
  },
}));
