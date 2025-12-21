import { getNoorChatInstructions, getNoorRealtimeInstructions } from './prompts/noor.prompt';

// Central model profile (single source of truth)

export type ToolSchema = {
  name: string;
  description: string;
  // JSON Schema-compatible parameters definition
  parameters: Record<string, any>;
};

export type ModelProfile = {
  id: string; // e.g. "gpt-realtime-mini", "gpt-4o-realtime-preview"
  temperature: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  voice?: string;
  modalities: Array<'text' | 'audio'>;
  instructions: string;
  realtimeInstructions?: string;
  tools: ToolSchema[];
};

const numberFromEnv = (value: string | undefined, fallback: number): number => {
  if (value === undefined || value === null) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const NOOR_TEMPERATURE = numberFromEnv(process.env.OPENAI_NOOR_TEMPERATURE, 0.78);
const NOOR_FREQUENCY_PENALTY = numberFromEnv(process.env.OPENAI_NOOR_FREQUENCY_PENALTY, 0.35);
const NOOR_PRESENCE_PENALTY = numberFromEnv(process.env.OPENAI_NOOR_PRESENCE_PENALTY, 0.15);

const JOHN_TEMPERATURE = numberFromEnv(process.env.OPENAI_JOHN_TEMPERATURE, 0.65);
const JOHN_FREQUENCY_PENALTY = numberFromEnv(process.env.OPENAI_JOHN_FREQUENCY_PENALTY, 0.25);
const JOHN_PRESENCE_PENALTY = numberFromEnv(process.env.OPENAI_JOHN_PRESENCE_PENALTY, 0.1);

const noorTools: ToolSchema[] = [
  {
    name: 'web_search',
    description:
      'Search the public web for recent information (market news, macro context, FX). Cite the sources succinctly.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: "Precise query, e.g. 'Dubai Marina property prices 2025'",
        },
        maxResults: {
          type: 'integer',
          minimum: 1,
          maximum: 10,
          description: 'Number of results to return (3-5 is usually enough).',
        },
        recencyDays: {
          type: 'integer',
          minimum: 0,
          maximum: 90,
          description: 'Restrict results to the last N days (optional).',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'web_open',
    description: 'Fetch the metadata (title, description) of a specific URL to quote a source precisely.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', format: 'uri' },
      },
      required: ['url'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_property_details',
    description:
      'Retrieve the full factual sheet of a specific Reccos property (price per share, area, bedrooms, availability, images).',
    parameters: {
      type: 'object',
      properties: {
        propertyId: {
          type: 'string',
          description: 'The unique Reccos property identifier.',
        },
      },
      required: ['propertyId'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_available_properties',
    description:
      'CRITICAL: list properties available for investment. Call it whenever the user asks for availability, mentions a budget, or before saying “nothing is available”.',
    parameters: {
      type: 'object',
      properties: {
        emirate: {
          type: 'string',
          description: 'Emirate filter (dubai, abu_dhabi, sharjah, etc.).',
        },
        zone: {
          type: 'string',
          description: 'Zone/neighborhood filter (palm_jumeirah, downtown, dubai_marina, etc.).',
        },
        propertyType: {
          type: 'string',
          description: 'Type: apartment, villa, penthouse, townhouse, commercial.',
        },
        bedrooms: {
          type: 'integer',
          description: 'Exact bedroom count filter.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 20,
          description: 'Maximum number of properties to return (default 10).',
        },
        status: {
          type: 'string',
          enum: ['published', 'upcoming', 'all'],
          description: 'Filter by status when necessary. Default returns both published + upcoming.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'calculate_investment',
    description:
      'Provide informative (non-advisory) projections based on Reccos data. Never phrase the result as a recommendation.',
    parameters: {
      type: 'object',
      properties: {
        propertyId: {
          type: 'string',
          description: 'ID of the property to simulate.',
        },
        numberOfShares: {
          type: 'integer',
          minimum: 1,
          description: 'Number of shares to simulate (optional when investmentAmount is provided).',
        },
        investmentAmount: {
          type: 'number',
          description: 'Amount in AED to invest. The backend will infer the share count.',
        },
        holdingPeriodYears: {
          type: 'integer',
          minimum: 1,
          maximum: 30,
          description: 'Projection horizon in years (default: 5).',
        },
      },
      required: ['propertyId'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_market_stats',
    description:
      'Summarize factual Reccos stats (zones available, share prices, property counts). Never extrapolate beyond the returned data.',
    parameters: {
      type: 'object',
      properties: {
        zone: {
          type: 'string',
          description: 'Optional zone filter for the stats.',
        },
      },
      additionalProperties: false,
    },
  },
];

export const profileNoor: ModelProfile = {
  id: process.env.OPENAI_MODEL_REALTIME || 'gpt-4o-realtime-preview',
  temperature: NOOR_TEMPERATURE,
  frequencyPenalty: NOOR_FREQUENCY_PENALTY,
  presencePenalty: NOOR_PRESENCE_PENALTY,
  voice: process.env.OPENAI_REALTIME_VOICE || 'shimmer',
  modalities: ['audio', 'text'],
  instructions: getNoorChatInstructions(),
  tools: noorTools,
};

profileNoor.realtimeInstructions = getNoorRealtimeInstructions();

// Backward compatibility exports
export function getRealtimeInstructionsForLang(): string {
  return getNoorRealtimeInstructions();
}

export function ensureRealtimeVoiceInstructions(_: string): string {
  return getRealtimeInstructionsForLang();
}

const johnTools: ToolSchema[] = [
  {
    name: 'web_search',
    description: 'Search the web for recent information and cite sources succinctly.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        maxResults: { type: 'integer', minimum: 1, maximum: 10 },
        recencyDays: { type: 'integer', minimum: 0, maximum: 90 },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'web_open',
    description: 'Fetch metadata (title, description) for a specific URL.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', format: 'uri' },
      },
      required: ['url'],
      additionalProperties: false,
    },
  },
];

export const profileJohn: ModelProfile = {
  id: process.env.OPENAI_MODEL_TEXT || 'gpt-4o-mini',
  temperature: JOHN_TEMPERATURE,
  frequencyPenalty: JOHN_FREQUENCY_PENALTY,
  presencePenalty: JOHN_PRESENCE_PENALTY,
  voice: process.env.OPENAI_REALTIME_VOICE || 'alloy',
  modalities: ['audio', 'text'],
  instructions: [
    'You are John, an AI assistant specialized in real estate, with primary expertise in Dubai (Palm Jumeirah, Downtown, etc.).',
    'Be concise, professional, and helpful. Always keep responses factual and actionable.',
    "CRITICAL: When the user uses pronouns like 'there' or 'that area', map them to the most recent location mentioned in the conversation.",
    'When the user asks for listings, availability, prices, or market info, use web_search to retrieve recent data and cite sources succinctly.',
    'If web_search is unavailable, state the limitation and propose next steps (filters, budget, location).',
  ].join('\n'),
  tools: johnTools,
};

profileJohn.realtimeInstructions = getNoorRealtimeInstructions();

// ============================================
// Default profile selection
// ============================================
const DEFAULT_PROFILE = process.env.AI_DEFAULT_PROFILE || 'noor';

export const defaultProfile: ModelProfile = DEFAULT_PROFILE === 'john' ? profileJohn : profileNoor;

export const profiles: Record<string, ModelProfile> = {
  noor: profileNoor,
  john: profileJohn,
};

export function getProfile(name?: string): ModelProfile {
  if (!name) return defaultProfile;
  return profiles[name.toLowerCase()] || defaultProfile;
}
