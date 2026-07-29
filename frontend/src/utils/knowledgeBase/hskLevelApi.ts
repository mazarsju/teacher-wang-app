export type HskLevelStatus = {
  current_level: number | null;
  next_level: number | null;
  characters_to_next_level: number | null;
  progress_to_next_level: number;
  missing_characters: string[];
  max_level: number;
  completion_ratio: number;
};

export async function fetchHskLevelStatus(): Promise<HskLevelStatus> {
  const response = await fetch("/hsk-level", { method: "GET" });

  if (!response.ok) {
    throw new Error("Failed to load HSK level.");
  }

  return (await response.json()) as HskLevelStatus;
}
