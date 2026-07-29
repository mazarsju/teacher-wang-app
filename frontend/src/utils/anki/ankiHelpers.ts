import type { AnkiDeckStatus } from "../../types/anki";

export async function readErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const data = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  return data?.error ?? fallback;
}

export function statusFromSyncCounts(options: {
  configured: boolean;
  pushCount: number;
  pullCount: number;
  unsyncableCount?: number;
}): AnkiDeckStatus {
  if (!options.configured) {
    return "not_configured";
  }
  if (
    options.pushCount > 0 ||
    options.pullCount > 0 ||
    (options.unsyncableCount ?? 0) > 0
  ) {
    return "not_synchronized";
  }
  return "synchronized";
}

export function versoSignificantPart(verso: string): string {
  return verso.split("-", 2)[0] ?? verso;
}
