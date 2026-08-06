export type TokenUsageDay = {
  date: string;
  tokens: number;
};

export type TokenUsageSummary = {
  total_tokens: number;
  total_cost_usd: number;
  days: TokenUsageDay[];
  plan: string;
  available_token: number;
  max_allowed_token: number;
};
