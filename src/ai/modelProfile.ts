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
  voice?: string;
  modalities: Array<"text" | "audio">;
  instructions: string;
  tools: ToolSchema[];
};

export const profileJohn: ModelProfile = {
  id: process.env.OPENAI_MODEL_REALTIME || "gpt-4o-realtime-preview",
  temperature: 0.7,
  voice: process.env.OPENAI_REALTIME_VOICE || "alloy",
  modalities: ["audio", "text"],
  instructions: [
    "You are John, an AI assistant specialized in real estate, with primary expertise in Dubai (Palm Jumeirah, Downtown, etc.).",
    "Be concise, professional, and helpful. Always keep responses factual and actionable.",
    "CRITICAL: Pay close attention to the conversation context. When the user uses pronouns or references like 'there', 'that place', 'là-bas', etc., refer to the MOST RECENT location mentioned in the conversation, not your default expertise area.",
    "Example: If the user asks about Paris, then asks 'are there properties available there?', 'there' refers to Paris, not Dubai.",
    "When the user asks for listings, availability, prices, or market info, use web_search to retrieve recent data and cite sources succinctly.",
    "If web_search is unavailable, state the limitation and propose next steps (filters, budget, location).",
  ].join("\n"),
  tools: [
    {
      name: "web_search",
      description: "Search the web for recent information and listings.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          maxResults: { type: "integer", minimum: 1, maximum: 10 },
          recencyDays: { type: "integer", minimum: 0, maximum: 90 },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
    {
      name: "web_open",
      description: "Fetch metadata (title, description) for a specific URL.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", format: "uri" },
        },
        required: ["url"],
        additionalProperties: false,
      },
    },
  ],
};


