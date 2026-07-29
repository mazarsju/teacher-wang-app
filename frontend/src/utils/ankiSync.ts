/**
 * Anki sync orchestration: talks to AnkiConnect and thin Flask DB APIs.
 */

import { isHanCharacter } from "./chineseCharacters";
import {
  AnkiConnectError,
  addNotes,
  createDeck,
  createModel,
  deckNames,
  isConnected,
  mappedNotesInDeck,
  modelFieldNames,
  modelNames,
  syncWithAnkiWeb,
} from "./ankiConnect";
import { normalizeAnkiPinyinToken } from "../types/pinyin";
import type {
  AnkiDeckKind,
  AnkiDeckMapping,
  AnkiDeckSetupResult,
  AnkiDeckStatus,
  AnkiFieldKey,
  AnkiOverallSynchronizationStatus,
  AnkiPendingCard,
  AnkiPendingSync,
  AnkiPendingVocabularyCard,
  AnkiPendingWrittingCard,
  AnkiQuickSyncResult,
  AnkiStatus,
  AnkiSyncAction,
  AnkiSyncDirection,
  AnkiSyncResult,
} from "../types/anki";
import { ANKI_REQUIRED_FIELDS } from "../types/anki";

const VOCABULARY_MANDATORY_FIELDS = ["writting", "pinyin", "definition"] as const;

const VOCABULARY_MODEL_CSS = `.card {
  font-family: arial;
  font-size: 20px;
  text-align: center;
  color: black;
  background-color: white;
}
.hanzi {
  font-size: 42px;
}
.extra-fields {
  margin-top: 1em;
  font-size: 16px;
  color: #444444;
}
`;

type SyncDataCharacter = {
  char: string;
  pinyin: string;
  writting_known: boolean;
  synchronized: boolean;
};

type SyncDataResponse = {
  kind: AnkiDeckKind;
  push_cards: AnkiPendingCard[];
  unsyncable: string[];
  local_words: string[];
  characters: SyncDataCharacter[];
  ignore_keys: string[];
  deck: AnkiDeckMapping;
};

type BackendStatusResponse = {
  synchronization_status: AnkiOverallSynchronizationStatus;
  pending_push_estimate: number;
  decks: Record<AnkiDeckKind, AnkiDeckMapping>;
};

async function readErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const data = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  return data?.error ?? fallback;
}

function ankiFieldRef(name: string): string {
  return `{{${name}}}`;
}

function optionalFieldsHtml(optionalFields: string[]): string {
  if (optionalFields.length === 0) {
    return "";
  }
  const lines = optionalFields.map(ankiFieldRef).join("<br>");
  return `<div class="extra-fields">${lines}</div>`;
}

export function buildVocabularyCardTemplates(
  optionalFields: string[],
): Array<{ Name: string; Front: string; Back: string }> {
  const extras = optionalFieldsHtml(optionalFields);
  const writting = ankiFieldRef("writting");
  const pinyin = ankiFieldRef("pinyin");
  const definition = ankiFieldRef("definition");

  return [
    {
      Name: "Writting → Pinyin + Definition",
      Front: `<div class="hanzi">${writting}</div>`,
      Back: `{{FrontSide}}<hr id=answer>${pinyin}<br>${definition}${extras}`,
    },
    {
      Name: "Pinyin → Writting + Definition",
      Front: pinyin,
      Back:
        `{{FrontSide}}<hr id=answer>` +
        `<div class="hanzi">${writting}</div><br>${definition}${extras}`,
    },
    {
      Name: "Definition → Writting + Pinyin",
      Front: definition,
      Back:
        `{{FrontSide}}<hr id=answer>` +
        `<div class="hanzi">${writting}</div><br>${pinyin}${extras}`,
    },
  ];
}

export function normalizeOptionalFields(optionalFields?: string[]): string[] {
  if (optionalFields === undefined) {
    return [];
  }
  if (!Array.isArray(optionalFields)) {
    throw new Error("optional_fields must be an array of strings");
  }

  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const raw of optionalFields) {
    if (typeof raw !== "string") {
      throw new Error("optional_fields must be an array of strings");
    }
    const name = raw.trim();
    if (name === "") {
      continue;
    }
    if ((VOCABULARY_MANDATORY_FIELDS as readonly string[]).includes(name)) {
      throw new Error(
        `Optional field "${name}" conflicts with a mandatory field name.`,
      );
    }
    const lowered = name.toLowerCase();
    if (seen.has(lowered)) {
      throw new Error(`Duplicate optional field "${name}".`);
    }
    seen.add(lowered);
    cleaned.push(name);
  }
  return cleaned;
}

function statusFromSyncCounts(options: {
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

function versoSignificantPart(verso: string): string {
  return verso.split("-", 2)[0] ?? verso;
}

function characterIdsFromVerso(verso: string): string[] {
  return [...versoSignificantPart(verso)].filter(isHanCharacter);
}

function characterIdsFromWrittingCards(
  cards: Array<{ verso: string }>,
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const card of cards) {
    for (const charId of characterIdsFromVerso(card.verso)) {
      if (seen.has(charId)) {
        continue;
      }
      seen.add(charId);
      ids.push(charId);
    }
  }
  return ids;
}

function syncMarkIdsForCards(
  kind: AnkiDeckKind,
  cards: AnkiPendingCard[],
): string[] {
  if (kind === "mandarin_vocabulary") {
    return cards.map((card) => card.id);
  }
  return characterIdsFromWrittingCards(
    cards as AnkiPendingWrittingCard[],
  );
}

function significantAnkiVersos(versos: Set<string>): Set<string> {
  const result = new Set<string>();
  for (const verso of versos) {
    const part = versoSignificantPart(verso).trim();
    if (part !== "") {
      result.add(part);
    }
  }
  return result;
}

function pairWrittingWithPinyinTokens(
  wordText: string,
  pinyinField: string,
): Array<[string, string | null]> {
  const tokens = pinyinField.split(/\s+/).filter((token) => token !== "");
  const pairs: Array<[string, string | null]> = [];
  let tokenIdx = 0;
  for (const char of wordText) {
    if (!isHanCharacter(char)) {
      continue;
    }
    const raw = tokenIdx < tokens.length ? tokens[tokenIdx] : "";
    tokenIdx += 1;
    const normalized = raw ? normalizeAnkiPinyinToken(raw) : null;
    pairs.push([char, normalized]);
  }
  return pairs;
}

function buildPinyinGuessMap(
  notes: Array<Record<string, string>>,
): Record<string, string> {
  const guesses: Record<string, string> = {};
  for (const note of notes) {
    const writting = (note.writting ?? "").trim();
    const pinyinField = (note.pinyin ?? "").trim();
    if (writting === "" || pinyinField === "") {
      continue;
    }
    for (const [char, pinyin] of pairWrittingWithPinyinTokens(
      writting,
      pinyinField,
    )) {
      if (pinyin === null || pinyin.length > 6 || char in guesses) {
        continue;
      }
      guesses[char] = pinyin;
    }
  }
  return guesses;
}

function resolvedCharPinyin(
  cardPinyin: string | null,
  char: string,
  guesses: Record<string, string>,
): string | null {
  if (cardPinyin !== null && cardPinyin.length <= 6) {
    return cardPinyin;
  }
  const guessed = guesses[char];
  if (guessed !== undefined && guessed.length <= 6) {
    return guessed;
  }
  return null;
}

function charactersToCreateForCard(
  wordText: string,
  pinyinField: string,
  characterByChar: Map<string, SyncDataCharacter>,
  guesses: Record<string, string>,
): string[] | null {
  const pinyinBlank = pinyinField.trim() === "";
  const toCreate: string[] = [];
  for (const [char, cardPinyin] of pairWrittingWithPinyinTokens(
    wordText,
    pinyinField,
  )) {
    if (characterByChar.has(char)) {
      continue;
    }
    const pinyin = resolvedCharPinyin(cardPinyin, char, guesses);
    if (pinyin === null) {
      if (pinyinBlank) {
        continue;
      }
      return null;
    }
    toCreate.push(char);
  }
  return toCreate;
}

function uniqueCharactersToCreate(
  cards: AnkiPendingVocabularyCard[],
): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const card of cards) {
    for (const char of card.characters_to_create ?? []) {
      if (seen.has(char)) {
        continue;
      }
      seen.add(char);
      ordered.push(char);
    }
  }
  return ordered;
}

function vocabularyPullCardsFromNotes(
  notes: Array<Record<string, string>>,
  localWords: Set<string>,
  ignored: Set<string>,
  characterByChar: Map<string, SyncDataCharacter>,
): {
  cards: AnkiPendingVocabularyCard[];
  missing: string[];
  autoIgnore: string[];
  guesses: Record<string, string>;
} {
  const guesses = buildPinyinGuessMap(notes);
  const cards: AnkiPendingVocabularyCard[] = [];
  const missing: string[] = [];
  const autoIgnore: string[] = [];
  const seen = new Set<string>();
  const seenMissing = new Set<string>();

  for (const note of notes) {
    const writting = (note.writting ?? "").trim();
    if (
      writting === "" ||
      localWords.has(writting) ||
      ignored.has(writting) ||
      seen.has(writting) ||
      seenMissing.has(writting)
    ) {
      continue;
    }
    if (writting.length > 10) {
      autoIgnore.push(writting);
      continue;
    }
    const hanChars = [...writting].filter(isHanCharacter);
    if (hanChars.length === 0) {
      continue;
    }
    const pinyin = (note.pinyin ?? "").trim();
    const charactersToCreate = charactersToCreateForCard(
      writting,
      pinyin,
      characterByChar,
      guesses,
    );
    if (charactersToCreate === null) {
      seenMissing.add(writting);
      missing.push(writting);
      continue;
    }
    seen.add(writting);
    const definition = (note.definition ?? "").trim().slice(0, 100);
    cards.push({
      id: writting,
      writting,
      pinyin,
      definition,
      characters_to_create: charactersToCreate,
    });
  }

  cards.sort((a, b) => a.writting.localeCompare(b.writting));
  missing.sort();
  return { cards, missing, autoIgnore, guesses };
}

function writtingPullFromNotes(
  notes: Array<Record<string, string>>,
  ignored: Set<string>,
  characterByChar: Map<string, SyncDataCharacter>,
): {
  pullCards: AnkiPendingWrittingCard[];
  missing: string[];
  warningRectos: string[];
} {
  const pullCards: AnkiPendingWrittingCard[] = [];
  const missing: string[] = [];
  const warningRectos: string[] = [];
  const seenPull = new Set<string>();
  const seenMissing = new Set<string>();
  const seenWarningRecto = new Set<string>();

  for (const note of notes) {
    const recto = (note.recto ?? "").trim();
    if (recto === "" || ignored.has(recto)) {
      continue;
    }
    const verso = versoSignificantPart(note.verso ?? "");
    let noteHasMissing = false;
    for (const char of verso) {
      if (!isHanCharacter(char)) {
        continue;
      }
      if (ignored.has(char)) {
        continue;
      }
      const record = characterByChar.get(char);
      if (record === undefined) {
        noteHasMissing = true;
        if (!seenMissing.has(char)) {
          seenMissing.add(char);
          missing.push(char);
        }
        continue;
      }
      if (record.writting_known) {
        continue;
      }
      if (seenPull.has(char)) {
        continue;
      }
      seenPull.add(char);
      pullCards.push({
        id: char,
        recto: record.pinyin,
        verso: char,
        anki_recto: recto,
      });
    }
    if (noteHasMissing && !seenWarningRecto.has(recto)) {
      seenWarningRecto.add(recto);
      warningRectos.push(recto);
    }
  }

  return { pullCards, missing, warningRectos };
}

async function fetchSyncData(kind: AnkiDeckKind): Promise<SyncDataResponse> {
  const response = await fetch(`/anki/sync/data/${encodeURIComponent(kind)}`, {
    method: "GET",
  });
  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, "Failed to load Anki sync data."),
    );
  }
  return (await response.json()) as SyncDataResponse;
}

async function fetchMappedNotes(
  kind: AnkiDeckKind,
  mapping: AnkiDeckMapping,
): Promise<Array<Record<string, string>>> {
  if (kind === "mandarin_vocabulary") {
    const writtingField = (mapping.fields.writting ?? "").trim();
    const pinyinField = (mapping.fields.pinyin ?? "").trim();
    const definitionField = (mapping.fields.definition ?? "").trim();
    if (
      writtingField === "" ||
      pinyinField === "" ||
      definitionField === ""
    ) {
      throw new Error("Mapped Anki vocabulary fields are incomplete.");
    }
    return mappedNotesInDeck(mapping.deck_name, {
      writting: writtingField,
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

async function markSynchronizedRequest(body: Record<string, unknown>): Promise<AnkiSyncResult> {
  const response = await fetch("/anki/sync/mark-synchronized", {
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

async function pullApplyRequest(body: Record<string, unknown>): Promise<AnkiSyncResult> {
  const response = await fetch("/anki/sync/pull-apply", {
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

function buildAnkiNotes(options: {
  kind: AnkiDeckKind;
  deckName: string;
  modelName: string;
  fieldMap: Partial<Record<AnkiFieldKey, string>>;
  cards: AnkiPendingCard[];
}): Array<Record<string, unknown>> {
  const notes: Array<Record<string, unknown>> = [];
  for (const card of options.cards) {
    let ankiFields: Record<string, string>;
    if (options.kind === "mandarin_vocabulary") {
      const vocab = card as AnkiPendingVocabularyCard;
      ankiFields = {
        [options.fieldMap.writting ?? ""]: vocab.writting,
        [options.fieldMap.pinyin ?? ""]: vocab.pinyin,
        [options.fieldMap.definition ?? ""]: vocab.definition,
      };
    } else {
      const writting = card as AnkiPendingWrittingCard;
      ankiFields = {
        [options.fieldMap.recto ?? ""]: writting.recto,
        [options.fieldMap.verso ?? ""]: writting.verso,
      };
    }
    notes.push({
      deckName: options.deckName,
      modelName: options.modelName,
      fields: ankiFields,
      options: { allowDuplicate: true },
      tags: ["learn-mandarin"],
    });
  }
  return notes;
}

export async function fetchAnkiStatus(): Promise<AnkiStatus> {
  const [connected, response] = await Promise.all([
    isConnected(),
    fetch("/anki/status", { method: "GET" }),
  ]);

  if (!response.ok) {
    throw new Error("Failed to load Anki synchronization status.");
  }

  const backend = (await response.json()) as BackendStatusResponse;
  const decks = { ...backend.decks };

  if (connected) {
    for (const kind of Object.keys(decks) as AnkiDeckKind[]) {
      const mapping = decks[kind];
      if (mapping.status === "not_configured") {
        continue;
      }
      try {
        const notes = await fetchMappedNotes(kind, mapping);
        const pullCount = notes.length > 0
          ? await estimatePullCount(kind, mapping, notes)
          : 0;
        // Recompute with pull awareness using current push status heuristic:
        // if already not_synchronized from push, keep it; else use pull.
        if (pullCount > 0 && mapping.status === "synchronized") {
          decks[kind] = { ...mapping, status: "not_synchronized" };
        }
      } catch {
        // Anki unreachable mid-check: keep push-only status from backend.
      }
    }
  }

  return {
    connected,
    synchronization_status: backend.synchronization_status,
    pending_push_estimate: backend.pending_push_estimate,
    decks,
  };
}

async function estimatePullCount(
  kind: AnkiDeckKind,
  mapping: AnkiDeckMapping,
  notes: Array<Record<string, string>>,
): Promise<number> {
  // Lightweight: use sync data local sets when available would be heavier.
  // For status banner we only need whether pull is non-empty.
  try {
    const data = await fetchSyncData(kind);
    const characterByChar = new Map(
      data.characters.map((row) => [row.char, row]),
    );
    const ignored = new Set(data.ignore_keys);
    if (kind === "mandarin_vocabulary") {
      const { cards, missing } = vocabularyPullCardsFromNotes(
        notes,
        new Set(data.local_words),
        ignored,
        characterByChar,
      );
      return cards.length + missing.length;
    }
    const { pullCards, missing } = writtingPullFromNotes(
      notes,
      ignored,
      characterByChar,
    );
    return pullCards.length + missing.length;
  } catch {
    void mapping;
    return 0;
  }
}

export async function fetchAnkiDecks(): Promise<string[]> {
  return deckNames();
}

export async function fetchAnkiModels(): Promise<string[]> {
  return modelNames();
}

export async function fetchAnkiModelFields(modelName: string): Promise<string[]> {
  return modelFieldNames(modelName);
}

export async function setupAnkiDeck(options: {
  kind: AnkiDeckKind;
  deckName: string;
  modelName: string;
  fields: Record<AnkiFieldKey, string>;
  create?: boolean;
}): Promise<AnkiDeckSetupResult> {
  const trimmedDeck = options.deckName.trim();
  const trimmedModel = options.modelName.trim();
  if (trimmedDeck === "") {
    throw new Error("deck_name must be a non-empty string");
  }
  if (trimmedModel === "") {
    throw new Error("model_name must be a non-empty string");
  }

  const required = ANKI_REQUIRED_FIELDS[options.kind];
  const cleanedFields: Record<string, string> = {};
  for (const field of required) {
    const value = options.fields[field.key];
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(
        `fields.${field.key} is required for kind "${options.kind}"`,
      );
    }
    cleanedFields[field.key] = value.trim();
  }

  if (options.create) {
    await createDeck(trimmedDeck);
  } else {
    const existing = await deckNames();
    if (!existing.includes(trimmedDeck)) {
      throw new Error(`Deck "${trimmedDeck}" was not found in Anki.`);
    }
  }

  const models = await modelNames();
  if (!models.includes(trimmedModel)) {
    throw new Error(`Note type "${trimmedModel}" was not found in Anki.`);
  }

  const modelFields = await modelFieldNames(trimmedModel);
  for (const [logicalKey, ankiField] of Object.entries(cleanedFields)) {
    if (!modelFields.includes(ankiField)) {
      throw new Error(
        `Field "${ankiField}" (mapped to ${logicalKey}) ` +
          `was not found on note type "${trimmedModel}".`,
      );
    }
  }

  const response = await fetch("/anki/decks/setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: options.kind,
      deck_name: trimmedDeck,
      model_name: trimmedModel,
      fields: cleanedFields,
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
  const trimmedDeck = options.deckName.trim();
  const trimmedModel = options.modelName.trim();
  if (trimmedDeck === "") {
    throw new Error("deck_name must be a non-empty string");
  }
  if (trimmedModel === "") {
    throw new Error("model_name must be a non-empty string");
  }

  const extras = normalizeOptionalFields(options.optionalFields);
  const fieldNames = [...VOCABULARY_MANDATORY_FIELDS, ...extras];

  const existingModels = await modelNames();
  if (existingModels.includes(trimmedModel)) {
    throw new Error(`Note type "${trimmedModel}" already exists in Anki.`);
  }

  await createModel({
    modelName: trimmedModel,
    fields: fieldNames,
    cardTemplates: buildVocabularyCardTemplates(extras),
    css: VOCABULARY_MODEL_CSS,
  });
  await createDeck(trimmedDeck);

  return {
    kind: "mandarin_vocabulary",
    deck: {
      status: "not_configured",
      deck_name: trimmedDeck,
      model_name: trimmedModel,
      fields: {
        writting: "writting",
        pinyin: "pinyin",
        definition: "definition",
      },
    },
  };
}

export async function fetchAnkiPendingSync(
  kind: AnkiDeckKind,
): Promise<AnkiPendingSync> {
  const data = await fetchSyncData(kind);
  const mapping = data.deck;
  const notes = await fetchMappedNotes(kind, mapping);
  const characterByChar = new Map(
    data.characters.map((row) => [row.char, row]),
  );
  const ignored = new Set(data.ignore_keys);

  if (kind === "mandarin_vocabulary") {
    const existingWrittings = new Set(
      notes
        .map((note) => (note.writting ?? "").trim())
        .filter((value) => value !== ""),
    );

    const alreadyInAnki: string[] = [];
    const pendingCards: AnkiPendingCard[] = [];
    for (const card of data.push_cards) {
      const vocab = card as AnkiPendingVocabularyCard;
      if (existingWrittings.has(vocab.writting)) {
        alreadyInAnki.push(vocab.id);
      } else {
        pendingCards.push(card);
      }
    }
    if (alreadyInAnki.length > 0) {
      await markSynchronizedRequest({
        kind,
        action: "partial",
        ids: alreadyInAnki,
      });
    }

    const { cards: pullCards, missing, autoIgnore, guesses } =
      vocabularyPullCardsFromNotes(
        notes,
        new Set(data.local_words),
        ignored,
        characterByChar,
      );
    void guesses;
    if (autoIgnore.length > 0) {
      await pullApplyRequest({
        kind,
        action: "cancel_all",
        cards: [],
        ignore_keys: autoIgnore,
      });
    }

    const pullCharacters = uniqueCharactersToCreate(pullCards);
    const deck: AnkiDeckMapping = {
      ...mapping,
      status: statusFromSyncCounts({
        configured: true,
        pushCount: pendingCards.length,
        pullCount: pullCards.length + missing.length,
      }),
    };

    return {
      kind,
      count: pendingCards.length,
      cards: pendingCards,
      unsyncable: [],
      pull_count: pullCards.length + missing.length,
      pull_cards: pullCards,
      pull_characters_to_create_count: pullCharacters.length,
      pull_missing: missing,
      deck,
    };
  }

  const existingVersos = new Set(
    notes
      .map((note) => (note.verso ?? "").trim())
      .filter((value) => value !== ""),
  );
  const ankiVersoKeys = significantAnkiVersos(existingVersos);
  const { pullCards, missing, warningRectos } = writtingPullFromNotes(
    notes,
    ignored,
    characterByChar,
  );

  const cards: AnkiPendingCard[] = [];
  const unsyncable = [...data.unsyncable];
  const alreadyInAnki: string[] = [];
  const seenRectos = new Set<string>();

  for (const card of data.push_cards) {
    const writting = card as AnkiPendingWrittingCard;
    if (ankiVersoKeys.has(writting.verso)) {
      alreadyInAnki.push(...characterIdsFromVerso(writting.verso));
      continue;
    }
    if (seenRectos.has(writting.recto)) {
      continue;
    }
    seenRectos.add(writting.recto);
    cards.push(writting);
  }

  if (alreadyInAnki.length > 0) {
    await markSynchronizedRequest({
      kind,
      action: "partial",
      ids: alreadyInAnki,
    });
  }

  const deck: AnkiDeckMapping = {
    ...mapping,
    status: statusFromSyncCounts({
      configured: true,
      pushCount: cards.length,
      pullCount: pullCards.length + missing.length,
      unsyncableCount: unsyncable.length,
    }),
  };

  return {
    kind,
    count: cards.length,
    cards,
    unsyncable,
    pull_count: pullCards.length + missing.length,
    pull_cards: pullCards,
    pull_missing: missing,
    pull_warning_rectos: warningRectos,
    pull_characters_to_create_count: 0,
    deck,
  };
}

export async function runAnkiSync(options: {
  kind: AnkiDeckKind;
  action: AnkiSyncAction;
  direction?: AnkiSyncDirection;
  selectedIds?: string[];
  syncToAnkiWeb?: boolean;
}): Promise<AnkiSyncResult> {
  const direction = options.direction ?? "push";
  if (direction === "pull") {
    return runPull(options.kind, options.action, options.selectedIds);
  }
  return runPush(
    options.kind,
    options.action,
    options.selectedIds,
    options.syncToAnkiWeb ?? true,
  );
}

async function runPush(
  kind: AnkiDeckKind,
  action: AnkiSyncAction,
  selectedIds: string[] | undefined,
  syncToAnkiWeb: boolean,
): Promise<AnkiSyncResult> {
  const pending = await fetchAnkiPendingSync(kind);
  const cards = pending.cards;
  const unsyncable = pending.unsyncable ?? [];
  const mapping = pending.deck;
  const pullCount = pending.pull_count;

  let toAdd: AnkiPendingCard[];
  let toIgnoreCards: AnkiPendingCard[];
  let extraIgnoreIds: string[] = [];

  if (action === "synchronize_all") {
    toAdd = cards;
    toIgnoreCards = [];
  } else if (action === "cancel_all") {
    toAdd = [];
    toIgnoreCards = cards;
    extraIgnoreIds = unsyncable;
  } else if (action === "partial") {
    if (selectedIds === undefined) {
      throw new Error("selected_ids is required for partial synchronization");
    }
    const pendingIds = new Set(cards.map((card) => card.id));
    const unknown = selectedIds.filter((id) => !pendingIds.has(id));
    if (unknown.length > 0) {
      throw new Error(
        `Unknown pending card ids: ${[...unknown].sort().join(", ")}`,
      );
    }
    const selectedSet = new Set(selectedIds);
    toAdd = cards.filter((card) => selectedSet.has(card.id));
    toIgnoreCards = cards.filter((card) => !selectedSet.has(card.id));
  } else {
    throw new Error(`Unsupported sync action "${action}"`);
  }

  const toIgnoreIds = [
    ...syncMarkIdsForCards(kind, toIgnoreCards),
    ...extraIgnoreIds,
  ];

  let added = 0;
  let failed = 0;
  let succeededIds: string[] = [];

  if (toAdd.length > 0) {
    const notes = buildAnkiNotes({
      kind,
      deckName: mapping.deck_name,
      modelName: mapping.model_name,
      fieldMap: mapping.fields,
      cards: toAdd,
    });
    const results = await addNotes(notes);
    const succeededCards: AnkiPendingCard[] = [];
    for (let index = 0; index < toAdd.length; index += 1) {
      const card = toAdd[index];
      const noteId = results[index];
      if (noteId === null || noteId === undefined) {
        failed += 1;
        continue;
      }
      succeededCards.push(card);
    }
    succeededIds = syncMarkIdsForCards(kind, succeededCards);
    added = succeededIds.length;

    if (failed > 0 && added === 0) {
      throw new AnkiConnectError(`Failed to add ${failed} note(s) to Anki.`);
    }
  }

  const result = await markSynchronizedRequest({
    kind,
    action,
    succeeded_ids: succeededIds,
    ignore_ids: toIgnoreIds,
    failed,
    pull_count: pullCount,
  });

  if (syncToAnkiWeb && added > 0) {
    await syncWithAnkiWeb();
  }

  return result;
}

async function runPull(
  kind: AnkiDeckKind,
  action: AnkiSyncAction,
  selectedIds: string[] | undefined,
): Promise<AnkiSyncResult> {
  const pending = await fetchAnkiPendingSync(kind);
  const cards = [...(pending.pull_cards ?? [])];
  const mapping = pending.deck;

  let toImport: AnkiPendingCard[];
  let toIgnore: AnkiPendingCard[];

  if (action === "synchronize_all") {
    toImport = cards;
    toIgnore = [];
  } else if (action === "cancel_all") {
    toImport = [];
    toIgnore = cards;
  } else if (action === "partial") {
    if (selectedIds === undefined) {
      throw new Error("selected_ids is required for partial pull");
    }
    const pendingIds = new Set(cards.map((card) => String(card.id)));
    const unknown = selectedIds.filter((id) => !pendingIds.has(id));
    if (unknown.length > 0) {
      throw new Error(
        `Unknown pending pull card ids: ${[...unknown].sort().join(", ")}`,
      );
    }
    const selectedSet = new Set(selectedIds);
    toImport = cards.filter((card) => selectedSet.has(String(card.id)));
    toIgnore = cards.filter((card) => !selectedSet.has(String(card.id)));
  } else {
    throw new Error(`Unsupported sync action "${action}"`);
  }

  let ignoreKeys: string[] = [];
  let pinyinGuesses: Record<string, string> = {};

  if (kind === "mandarin_vocabulary") {
    ignoreKeys = toIgnore.map((card) => String(card.id));
    if (action === "cancel_all") {
      ignoreKeys.push(
        ...(pending.pull_missing ?? []).filter((item) => item.trim() !== ""),
      );
    }
    try {
      const notes = await fetchMappedNotes(kind, mapping);
      pinyinGuesses = buildPinyinGuessMap(notes);
    } catch {
      pinyinGuesses = {};
    }
  } else {
    for (const card of toIgnore) {
      const writtingCard = card as AnkiPendingWrittingCard;
      const ankiRecto = String(writtingCard.anki_recto ?? "").trim();
      ignoreKeys.push(ankiRecto !== "" ? ankiRecto : String(card.id));
    }
    if (action === "cancel_all") {
      const warningRectos = pending.pull_warning_rectos ?? [];
      ignoreKeys.push(
        ...warningRectos.filter((item) => item.trim() !== ""),
      );
    }
  }

  const pullCountAfter = Math.max(
    0,
    cards.length - toImport.length - toIgnore.length,
  );

  return pullApplyRequest({
    kind,
    action,
    cards: toImport,
    ignore_keys: ignoreKeys,
    pinyin_guesses: pinyinGuesses,
    pull_count_after: pullCountAfter,
  });
}

export async function runAnkiQuickSync(): Promise<AnkiQuickSyncResult> {
  const vocabulary = await runPush(
    "mandarin_vocabulary",
    "synchronize_all",
    undefined,
    false,
  );
  const writting = await runPush(
    "mandarin_writting",
    "synchronize_all",
    undefined,
    false,
  );
  const notesAdded =
    (vocabulary.added ?? 0) + (writting.added ?? 0);
  if (notesAdded > 0) {
    await syncWithAnkiWeb();
  }

  const status = await fetchAnkiStatus();
  return {
    mandarin_vocabulary: vocabulary,
    mandarin_writting: writting,
    synchronization_status: status.synchronization_status,
    pending_push_estimate: status.pending_push_estimate,
  };
}
