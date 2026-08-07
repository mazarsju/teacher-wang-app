/**
 * Anki sync orchestration: pending lists, push/pull, status, quick sync.
 */

import {
  AnkiConnectError,
  addNotes,
  isConnected,
  syncWithAnkiWeb,
} from "./ankiConnect";
import {
  fetchBackendAnkiStatus,
  fetchMappedNotes,
  fetchSyncData,
  markSynchronizedRequest,
  pullApplyRequest,
} from "./ankiDbClient";
import { statusFromSyncCounts } from "./ankiHelpers";
import {
  buildAnkiNotes,
  significantAnkiVersos,
  syncMarkIdsForCards,
} from "./ankiNotes";
import {
  uniqueCharactersToCreate,
  vocabularyPullCardsFromNotes,
  writingPullFromNotes,
} from "./ankiPull";
import type {
  AnkiDeckKind,
  AnkiDeckMapping,
  AnkiPendingCard,
  AnkiPendingSync,
  AnkiPendingVocabularyCard,
  AnkiPendingWritingCard,
  AnkiQuickSyncResult,
  AnkiStatus,
  AnkiSyncAction,
  AnkiSyncDirection,
  AnkiSyncResult,
} from "../../types/anki";

export async function fetchAnkiStatus(
  hskCharacterPinyin: Record<string, string> = {},
): Promise<AnkiStatus> {
  const [connected, backend] = await Promise.all([
    isConnected(),
    fetchBackendAnkiStatus(),
  ]);

  const decks = { ...backend.decks };

  if (connected) {
    for (const kind of Object.keys(decks) as AnkiDeckKind[]) {
      const mapping = decks[kind];
      if (mapping.status === "not_configured") {
        continue;
      }
      try {
        const notes = await fetchMappedNotes(kind, mapping);
        const pullCount =
          notes.length > 0
            ? await estimatePullCount(kind, notes, hskCharacterPinyin)
            : 0;
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
  notes: Array<Record<string, string>>,
  hskCharacterPinyin: Record<string, string>,
): Promise<number> {
  try {
    const data = await fetchSyncData(kind);
    const ignored = new Set(data.ignore_keys);
    if (kind === "mandarin_vocabulary") {
      const characterByChar = new Map(
        (data.characters ?? []).map((row) => [row.char, row]),
      );
      const { cards, missing } = vocabularyPullCardsFromNotes(
        notes,
        new Set(data.local_words),
        ignored,
        characterByChar,
        hskCharacterPinyin,
      );
      return cards.length + missing.length;
    }
    const { pullCards, missing } = writingPullFromNotes(
      notes,
      new Set(data.local_words),
      new Set(data.writing_known_words ?? []),
      ignored,
    );
    return pullCards.length + missing.length;
  } catch {
    return 0;
  }
}

export async function fetchAnkiPendingSync(
  kind: AnkiDeckKind,
  hskCharacterPinyin: Record<string, string> = {},
): Promise<AnkiPendingSync> {
  const data = await fetchSyncData(kind);
  const mapping = data.deck;
  const notes = await fetchMappedNotes(kind, mapping);
  const ignored = new Set(data.ignore_keys);

  if (kind === "mandarin_vocabulary") {
    const characterByChar = new Map(
      (data.characters ?? []).map((row) => [row.char, row]),
    );
    const existingWritings = new Set(
      notes
        .map((note) => (note.writing ?? "").trim())
        .filter((value) => value !== ""),
    );

    const alreadyInAnki: string[] = [];
    const pendingCards: AnkiPendingCard[] = [];
    for (const card of data.push_cards) {
      const vocab = card as AnkiPendingVocabularyCard;
      if (existingWritings.has(vocab.writing)) {
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

    const { cards: pullCards, missing, autoIgnore } =
      vocabularyPullCardsFromNotes(
        notes,
        new Set(data.local_words),
        ignored,
        characterByChar,
        hskCharacterPinyin,
      );
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
  const { pullCards, missing } = writingPullFromNotes(
    notes,
    new Set(data.local_words),
    new Set(data.writing_known_words ?? []),
    ignored,
  );

  const cards: AnkiPendingCard[] = [];
  const unsyncable = [...data.unsyncable];
  const alreadyInAnki: string[] = [];

  for (const card of data.push_cards) {
    const writing = card as AnkiPendingWritingCard;
    if (ankiVersoKeys.has(writing.verso)) {
      alreadyInAnki.push(writing.id);
      continue;
    }
    cards.push(writing);
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
  hskCharacterPinyin?: Record<string, string>;
}): Promise<AnkiSyncResult> {
  const direction = options.direction ?? "push";
  if (direction === "pull") {
    return runPull(
      options.kind,
      options.action,
      options.selectedIds,
      options.hskCharacterPinyin ?? {},
    );
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
  hskCharacterPinyin: Record<string, string>,
): Promise<AnkiSyncResult> {
  const pending = await fetchAnkiPendingSync(kind, hskCharacterPinyin);
  const cards = [...(pending.pull_cards ?? [])];

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

  const ignoreKeys: string[] = toIgnore.map((card) => String(card.id));
  if (action === "cancel_all") {
    ignoreKeys.push(
      ...(pending.pull_missing ?? []).filter((item) => item.trim() !== ""),
    );
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
  const writing = await runPush(
    "mandarin_writing",
    "synchronize_all",
    undefined,
    false,
  );
  const notesAdded = (vocabulary.added ?? 0) + (writing.added ?? 0);
  if (notesAdded > 0) {
    await syncWithAnkiWeb();
  }

  const status = await fetchAnkiStatus();
  return {
    mandarin_vocabulary: vocabulary,
    mandarin_writing: writing,
    synchronization_status: status.synchronization_status,
    pending_push_estimate: status.pending_push_estimate,
  };
}
