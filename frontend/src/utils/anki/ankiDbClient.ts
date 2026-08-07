/**
 * Flask Anki bookkeeping (knowledge-base DB / settings).
 * These are NOT AnkiConnect calls — use API_BASE so cloud nginx can reach ECS.
 * AnkiConnect note I/O lives in ankiConnect.ts → http://127.0.0.1:8765.
 */
import type {
  AnkiDeckKind,
  AnkiDeckMapping,
  AnkiDeckSetupResult,
  AnkiOverallSynchronizationStatus,
  AnkiPendingCard,
  AnkiSyncResult,
} from "../../types/anki";
import { API_BASE } from "../apiBase";
import { apiFetch } from "../auth/apiFetch";
import { mappedNotesInDeck } from "./ankiConnect";
import { readErrorMessage } from "./ankiHelpers";
import type { SyncDataCharacter } from "./ankiPull";

export type SyncDataResponse = {
  kind: AnkiDeckKind;
  push_cards: AnkiPendingCard[];
  unsyncable: string[];
  local_words: string[];
  characters: SyncDataCharacter[];
  ignore_keys: string[];
  deck: AnkiDeckMapping;
};

export type BackendStatusResponse = {
  synchronization_status: AnkiOverallSynchronizationStatus;
  pending_push_estimate: number;
  decks: Record<AnkiDeckKind, AnkiDeckMapping>;
};

export async function fetchSyncData(
  kind: AnkiDeckKind,
): Promise<SyncDataResponse> {
  const response = await apiFetch(
    `${API_BASE}/anki/sync/data/${encodeURIComponent(kind)}`,
    {
      method: "GET",
    },
  );
  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, "Failed to load Anki sync data."),
    );
  }
  return (await response.json()) as SyncDataResponse;
}

export async function fetchBackendAnkiStatus(): Promise<BackendStatusResponse> {
  const response = await apiFetch(`${API_BASE}/anki/status`, { method: "GET" });
  if (!response.ok) {
    throw new Error("Failed to load Anki synchronization status.");
  }
  return (await response.json()) as BackendStatusResponse;
}

export async function fetchMappedNotes(
  kind: AnkiDeckKind,
  mapping: AnkiDeckMapping,
): Promise<Array<Record<string, string>>> {
  if (kind === "mandarin_vocabulary") {
    const writingField = (mapping.fields.writing ?? "").trim();
    const pinyinField = (mapping.fields.pinyin ?? "").trim();
    const definitionField = (mapping.fields.definition ?? "").trim();
    if (
      writingField === "" ||
      pinyinField === "" ||
      definitionField === ""
    ) {
      throw new Error("Mapped Anki vocabulary fields are incomplete.");
    }
    return mappedNotesInDeck(mapping.deck_name, {
      writing: writingField,
      pinyin: pinyinField,
      definition: definitionField,
    });
  }

  const rectoField = (mapping.fields.recto ?? "").trim();
  const versoField = (mapping.fields.verso ?? "").trim();
  if (rectoField === "" || versoField === "") {
    throw new Error("Mapped Anki writing fields are incomplete.");
  }
  return mappedNotesInDeck(mapping.deck_name, {
    recto: rectoField,
    verso: versoField,
  });
}

export async function markSynchronizedRequest(
  body: Record<string, unknown>,
): Promise<AnkiSyncResult> {
  const response = await apiFetch(`${API_BASE}/anki/sync/mark-synchronized`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, "Failed to update synchronized state."),
    );
  }
  return (await response.json()) as AnkiSyncResult;
}

export async function pullApplyRequest(
  body: Record<string, unknown>,
): Promise<AnkiSyncResult> {
  const response = await apiFetch(`${API_BASE}/anki/sync/pull-apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, "Failed to import cards from Anki."),
    );
  }
  return (await response.json()) as AnkiSyncResult;
}

export async function persistDeckSetup(body: {
  kind: AnkiDeckKind;
  deck_name: string;
  model_name: string;
  fields: Record<string, string>;
}): Promise<AnkiDeckSetupResult> {
  const response = await apiFetch(`${API_BASE}/anki/decks/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, "Failed to set up Anki deck."),
    );
  }

  return (await response.json()) as AnkiDeckSetupResult;
}
