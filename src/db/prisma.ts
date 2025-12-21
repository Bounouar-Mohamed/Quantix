import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export type Pricing = {
  inputPer1K: number;  // USD per 1K tokens
  outputPer1K: number;
};

// Prix OpenAI (coûts réels, ce qu'on paie)
// Source: https://openai.com/pricing
export const MODEL_PRICING: Record<string, Pricing> = {
  // GPT-4o family
  'gpt-4o': { inputPer1K: 0.0025, outputPer1K: 0.01 },
  'gpt-4o-mini': { inputPer1K: 0.00015, outputPer1K: 0.0006 },
  'gpt-4o-audio-preview': { inputPer1K: 0.0025, outputPer1K: 0.01 },
  
  // Realtime models
  'gpt-4o-realtime-preview': { inputPer1K: 0.005, outputPer1K: 0.02 },
  'gpt-4o-mini-realtime-preview': { inputPer1K: 0.0006, outputPer1K: 0.0024 },
  
  // GPT-4 Turbo
  'gpt-4-turbo': { inputPer1K: 0.01, outputPer1K: 0.03 },
  'gpt-4-turbo-preview': { inputPer1K: 0.01, outputPer1K: 0.03 },
  
  // GPT-4
  'gpt-4': { inputPer1K: 0.03, outputPer1K: 0.06 },
  'gpt-4-32k': { inputPer1K: 0.06, outputPer1K: 0.12 },
  
  // GPT-3.5
  'gpt-3.5-turbo': { inputPer1K: 0.0005, outputPer1K: 0.0015 },
  'gpt-3.5-turbo-16k': { inputPer1K: 0.003, outputPer1K: 0.004 },
  
  // Embeddings
  'text-embedding-3-small': { inputPer1K: 0.00002, outputPer1K: 0 },
  'text-embedding-3-large': { inputPer1K: 0.00013, outputPer1K: 0 },
  'text-embedding-ada-002': { inputPer1K: 0.0001, outputPer1K: 0 },
  
  // Whisper (audio)
  'whisper-1': { inputPer1K: 0.006, outputPer1K: 0 }, // per minute, not per 1K tokens
  
  // TTS
  'tts-1': { inputPer1K: 0.015, outputPer1K: 0 }, // per 1K characters
  'tts-1-hd': { inputPer1K: 0.03, outputPer1K: 0 },
};

/**
 * Calcule le coût OpenAI pour une requête
 */
export function computeCost(model: string, promptTokens: number, completionTokens: number): number {
  // Trouver le pricing (fallback sur gpt-4o-mini)
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['gpt-4o-mini'];
  
  const inCost = (promptTokens / 1000) * pricing.inputPer1K;
  const outCost = (completionTokens / 1000) * pricing.outputPer1K;
  
  return +(inCost + outCost).toFixed(6);
}

/**
 * Calcule le coût pour une session realtime (en minutes)
 */
export function computeRealtimeCost(model: string, durationMinutes: number): number {
  // Les modèles realtime sont facturés différemment
  // Approximation basée sur le débit moyen
  const avgTokensPerMinute = 150; // Estimation
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['gpt-4o-realtime-preview'];
  
  const tokensUsed = durationMinutes * avgTokensPerMinute;
  const cost = (tokensUsed / 1000) * (pricing.inputPer1K + pricing.outputPer1K) / 2;
  
  return +cost.toFixed(6);
}

/**
 * Récupère le pricing d'un modèle
 */
export function getModelPricing(model: string): Pricing {
  return MODEL_PRICING[model] || MODEL_PRICING['gpt-4o-mini'];
}
