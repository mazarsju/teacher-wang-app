export type TokenUsageDay = {
  date: string;
  tokens: number;
};

export type TokenUsageSummary = {
  total_tokens: number;
  total_cost_usd: number;
  days: TokenUsageDay[];
};
