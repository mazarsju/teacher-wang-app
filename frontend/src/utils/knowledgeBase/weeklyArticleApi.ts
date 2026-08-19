import { API_BASE } from "../apiBase";
import { apiFetch } from "../auth/apiFetch";

export type WeeklyArticleNewWord = {
  word: string;
  translation: string;
};

export type WeeklyArticleItem = {
  title: string;
  content: string;
  category?: string[];
  translation?: string;
  pinyin?: string;
  new_words?: WeeklyArticleNewWord[];
};

export type WeeklyArticle = {
  week: number;
  year: number;
  hsk_level: number;
  content: WeeklyArticleItem[] | null;
};

export async function fetchWeeklyArticle(): Promise<WeeklyArticle> {
  const response = await apiFetch(`${API_BASE}/weekly-articles`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error("Failed to load your weekly articles.");
  }

  return (await response.json()) as WeeklyArticle;
}
