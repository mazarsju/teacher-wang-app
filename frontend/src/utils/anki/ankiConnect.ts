/** Thin HTTP client for the AnkiConnect add-on (localhost:8765). */

export const ANKI_CONNECT_URL = "http://127.0.0.1:8765";
export const ANKI_CONNECT_VERSION = 6;
const DEFAULT_TIMEOUT_MS = 3000;

export class AnkiConnectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnkiConnectError";
  }
}

type AnkiConnectResponse = {
  result?: unknown;
  error?: string | null;
};

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AnkiConnectError(
        "AnkiConnect is unreachable. Start Anki with the AnkiConnect add-on enabled.",
      );
    }
    throw new AnkiConnectError(
      "AnkiConnect is unreachable. Start Anki with the AnkiConnect add-on enabled.",
    );
  } finally {
    window.clearTimeout(timer);
  }
}

export async function invoke(
  action: string,
  options?: {
    params?: Record<string, unknown>;
    url?: string;
    timeoutMs?: number;
  },
): Promise<unknown> {
  const url = options?.url ?? ANKI_CONNECT_URL;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const payload = {
    action,
    version: ANKI_CONNECT_VERSION,
    params: options?.params ?? {},
  };

  let response: Response;
  try {
    response = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      timeoutMs,
    );
  } catch (error) {
    if (error instanceof AnkiConnectError) {
      throw error;
    }
    throw new AnkiConnectError(
      "AnkiConnect is unreachable. Start Anki with the AnkiConnect add-on enabled.",
    );
  }

  let data: AnkiConnectResponse;
  try {
    data = (await response.json()) as AnkiConnectResponse;
  } catch {
    throw new AnkiConnectError("AnkiConnect returned an invalid response.");
  }

  if (data === null || typeof data !== "object") {
    throw new AnkiConnectError("AnkiConnect returned an invalid response.");
  }

  if (data.error != null) {
    throw new AnkiConnectError(String(data.error));
  }

  return data.result;
}

export async function deckNames(): Promise<string[]> {
  const result = await invoke("deckNames");
  if (
    !Array.isArray(result) ||
    !result.every((name): name is string => typeof name === "string")
  ) {
    throw new AnkiConnectError("AnkiConnect returned an invalid deck list.");
  }
  return result;
}

export async function createDeck(deckName: string): Promise<unknown> {
  return invoke("createDeck", { params: { deck: deckName } });
}

export async function modelNames(): Promise<string[]> {
  const result = await invoke("modelNames");
  if (
    !Array.isArray(result) ||
    !result.every((name): name is string => typeof name === "string")
  ) {
    throw new AnkiConnectError("AnkiConnect returned an invalid model list.");
  }
  return result;
}

export async function modelFieldNames(modelName: string): Promise<string[]> {
  const result = await invoke("modelFieldNames", {
    params: { modelName },
  });
  if (
    !Array.isArray(result) ||
    !result.every((name): name is string => typeof name === "string")
  ) {
    throw new AnkiConnectError("AnkiConnect returned an invalid field list.");
  }
  return result;
}

export async function createModel(options: {
  modelName: string;
  fields: string[];
  cardTemplates: Array<{ Name: string; Front: string; Back: string }>;
  css?: string;
}): Promise<unknown> {
  const params: Record<string, unknown> = {
    modelName: options.modelName,
    inOrderFields: options.fields,
    cardTemplates: options.cardTemplates,
    isCloze: false,
  };
  if (options.css !== undefined) {
    params.css = options.css;
  }
  return invoke("createModel", { params });
}

export async function addNotes(
  notes: Array<Record<string, unknown>>,
  options?: { timeoutMs?: number },
): Promise<Array<number | null>> {
  const result = await invoke("addNotes", {
    params: { notes },
    timeoutMs: options?.timeoutMs ?? 30_000,
  });
  if (!Array.isArray(result)) {
    throw new AnkiConnectError("AnkiConnect returned an invalid addNotes result.");
  }
  return result as Array<number | null>;
}

export async function syncWithAnkiWeb(options?: {
  timeoutMs?: number;
}): Promise<void> {
  await invoke("sync", { timeoutMs: options?.timeoutMs ?? 120_000 });
}

function quoteAnkiQueryValue(value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

export async function findNotes(
  query: string,
  options?: { timeoutMs?: number },
): Promise<number[]> {
  const result = await invoke("findNotes", {
    params: { query },
    timeoutMs: options?.timeoutMs ?? 30_000,
  });
  if (
    !Array.isArray(result) ||
    !result.every((noteId): noteId is number => typeof noteId === "number")
  ) {
    throw new AnkiConnectError("AnkiConnect returned an invalid findNotes result.");
  }
  return result;
}

export async function notesInfo(
  noteIds: number[],
  options?: { timeoutMs?: number },
): Promise<Array<Record<string, unknown>>> {
  if (noteIds.length === 0) {
    return [];
  }
  const result = await invoke("notesInfo", {
    params: { notes: noteIds },
    timeoutMs: options?.timeoutMs ?? 30_000,
  });
  if (
    !Array.isArray(result) ||
    !result.every(
      (item): item is Record<string, unknown> =>
        item !== null && typeof item === "object",
    )
  ) {
    throw new AnkiConnectError("AnkiConnect returned an invalid notesInfo result.");
  }
  return result;
}

export async function mappedNotesInDeck(
  deckName: string,
  logicalToAnki: Record<string, string>,
  options?: { timeoutMs?: number },
): Promise<Array<Record<string, string>>> {
  const query = `deck:${quoteAnkiQueryValue(deckName)}`;
  const noteIds = await findNotes(query, options);
  const notes: Array<Record<string, string>> = [];
  const chunkSize = 250;
  for (let start = 0; start < noteIds.length; start += chunkSize) {
    const chunk = noteIds.slice(start, start + chunkSize);
    for (const info of await notesInfo(chunk, options)) {
      const fields = info.fields;
      if (fields === null || typeof fields !== "object") {
        continue;
      }
      const mapped: Record<string, string> = {};
      for (const [logicalKey, ankiField] of Object.entries(logicalToAnki)) {
        const field = (fields as Record<string, unknown>)[ankiField];
        let raw: unknown;
        if (field !== null && typeof field === "object") {
          raw = (field as { value?: unknown }).value;
        } else {
          raw = field;
        }
        mapped[logicalKey] = typeof raw === "string" ? raw.trim() : "";
      }
      notes.push(mapped);
    }
  }
  return notes;
}

export async function isConnected(): Promise<boolean> {
  try {
    await deckNames();
    return true;
  } catch {
    return false;
  }
}
