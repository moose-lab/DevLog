import type { TokenUsage } from "./types";

// Pricing per million tokens (USD)
const PRICING: Record<string, { input: number; output: number; cacheCreation: number; cacheRead: number }> = {
  "claude-opus-4-7": { input: 5, output: 25, cacheCreation: 6.25, cacheRead: 0.5 },
  "claude-opus-4-6": { input: 5, output: 25, cacheCreation: 6.25, cacheRead: 0.5 },
  "claude-opus-4-5": { input: 5, output: 25, cacheCreation: 6.25, cacheRead: 0.5 },
  "claude-opus-4-1": { input: 15, output: 75, cacheCreation: 18.75, cacheRead: 1.5 },
  "claude-opus-4": { input: 15, output: 75, cacheCreation: 18.75, cacheRead: 1.5 },
  "claude-sonnet-4-6": { input: 3, output: 15, cacheCreation: 3.75, cacheRead: 0.3 },
  "claude-sonnet-4-5-20241022": { input: 3, output: 15, cacheCreation: 3.75, cacheRead: 0.3 },
  "claude-sonnet-4-5": { input: 3, output: 15, cacheCreation: 3.75, cacheRead: 0.3 },
  "claude-sonnet-4": { input: 3, output: 15, cacheCreation: 3.75, cacheRead: 0.3 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheCreation: 1.25, cacheRead: 0.1 },
  "claude-haiku-3-5": { input: 0.80, output: 4, cacheCreation: 1, cacheRead: 0.08 },
  "claude-3-5-haiku": { input: 0.80, output: 4, cacheCreation: 1, cacheRead: 0.08 },
};

const FALLBACK = { input: 3, output: 15, cacheCreation: 3.75, cacheRead: 0.3 };

function findPricing(model: string) {
  if (PRICING[model]) return PRICING[model];
  // Fuzzy match: check if model string contains a known key
  for (const [key, val] of Object.entries(PRICING).sort((a, b) => b[0].length - a[0].length)) {
    if (model.includes(key) || key.includes(model)) return val;
  }
  // Match by family
  if (model.includes("opus")) return PRICING["claude-opus-4-6"];
  if (model.includes("haiku")) return PRICING["claude-haiku-4-5"];
  if (model.includes("sonnet")) return PRICING["claude-sonnet-4-6"];
  return FALLBACK;
}

export function computeCost(model: string, usage: TokenUsage): number {
  const p = findPricing(model);
  const perM = 1_000_000;

  let cost = 0;
  cost += (usage.input_tokens || 0) * p.input / perM;
  cost += (usage.output_tokens || 0) * p.output / perM;
  cost += (usage.cache_creation_input_tokens || 0) * p.cacheCreation / perM;
  cost += (usage.cache_read_input_tokens || 0) * p.cacheRead / perM;

  return cost;
}
