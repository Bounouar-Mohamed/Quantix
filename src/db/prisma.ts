import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export type Pricing = {
  inputPer1K: number; // USD per 1K tokens
  outputPer1K: number;
};

// Exact pricing table (adjust as needed)
export const MODEL_PRICING: Record<string, Pricing> = {
  'gpt-4o-mini': { inputPer1K: 0.00015, outputPer1K: 0.0006 },
  'gpt-4o-realtime-preview': { inputPer1K: 0.00015, outputPer1K: 0.0006 },
};

export function computeCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['gpt-4o-mini'];
  const inCost = (promptTokens / 1000) * pricing.inputPer1K;
  const outCost = (completionTokens / 1000) * pricing.outputPer1K;
  return +(inCost + outCost).toFixed(6);
}




