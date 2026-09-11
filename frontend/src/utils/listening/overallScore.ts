export type ScoreTier = "excellent" | "good" | "fair" | "poor";

export function overallScore(vocabularyScore: number, grammarScore: number): number {
  return vocabularyScore + grammarScore;
}

export function scoreTier(overallScore: number): ScoreTier {
  if (overallScore > 180) return "excellent";
  if (overallScore > 160) return "good";
  if (overallScore > 130) return "fair";
  return "poor";
}
