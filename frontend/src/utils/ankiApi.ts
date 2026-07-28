import type {
  AnkiDeckKind,
  AnkiDeckSetupResult,
  AnkiFieldKey,
  AnkiPendingSync,
  AnkiStatus,
  AnkiSyncAction,
  AnkiSyncResult,
} from "../types/anki";

async function readErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const data = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  return data?.error ?? fallback;
}

export async function fetchAnkiStatus(): Promise<AnkiStatus> {
  const response = await fetch("/anki/status", { method: "GET" });

  if (!response.ok) {
    throw new Error("Failed to load Anki synchronization status.");
  }

  return (await response.json()) as AnkiStatus;
}

export async function fetchAnkiDecks(): Promise<string[]> {
  const response = await fetch("/anki/decks", { method: "GET" });

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, "Failed to load Anki decks."),
    );
  }

  const data = (await response.json()) as { decks: string[] };
  return data.decks;
}

export async function fetchAnkiModels(): Promise<string[]> {
  const response = await fetch("/anki/models", { method: "GET" });

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, "Failed to load Anki deck types."),
    );
  }

  const data = (await response.json()) as { models: string[] };
  return data.models;
}

export async function fetchAnkiModelFields(modelName: string): Promise<string[]> {
  const response = await fetch(
    `/anki/models/${encodeURIComponent(modelName)}/fields`,
    { method: "GET" },
  );

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, "Failed to load Anki note fields."),
    );
  }

  const data = (await response.json()) as { fields: string[] };
  return data.fields;
}

export async function setupAnkiDeck(options: {
  kind: AnkiDeckKind;
  deckName: string;
  modelName: string;
  fields: Record<AnkiFieldKey, string>;
  create?: boolean;
}): Promise<AnkiDeckSetupResult> {
  const response = await fetch("/anki/decks/setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: options.kind,
      deck_name: options.deckName,
      model_name: options.modelName,
      fields: options.fields,
      create: options.create ?? false,
    }),
  });

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, "Failed to set up Anki deck."),
    );
  }

  return (await response.json()) as AnkiDeckSetupResult;
}

export async function autoSetupVocabularyDeck(options: {
  deckName: string;
  modelName: string;
  optionalFields?: string[];
}): Promise<AnkiDeckSetupResult> {
  const response = await fetch("/anki/vocabulary/auto-setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deck_name: options.deckName,
      model_name: options.modelName,
      optional_fields: options.optionalFields ?? [],
    }),
  });

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        "Failed to create the 3-direction vocabulary deck type.",
      ),
    );
  }

  return (await response.json()) as AnkiDeckSetupResult;
}

export async function fetchAnkiPendingSync(
  kind: AnkiDeckKind,
): Promise<AnkiPendingSync> {
  const response = await fetch(`/anki/sync/pending/${encodeURIComponent(kind)}`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, "Failed to load pending Anki cards."),
    );
  }

  return (await response.json()) as AnkiPendingSync;
}

export async function runAnkiSync(options: {
  kind: AnkiDeckKind;
  action: AnkiSyncAction;
  selectedIds?: string[];
}): Promise<AnkiSyncResult> {
  const response = await fetch("/anki/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: options.kind,
      action: options.action,
      selected_ids: options.selectedIds,
    }),
  });

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, "Failed to synchronize with Anki."),
    );
  }

  return (await response.json()) as AnkiSyncResult;
}
