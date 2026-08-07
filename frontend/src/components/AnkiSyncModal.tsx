import { useEffect, useMemo, useState } from "react";
import { useAppSelector } from "../store/hooks";
import {
  ANKI_DECK_LABELS,
  type AnkiDeckKind,
  type AnkiPendingCard,
  type AnkiPendingSync,
  type AnkiPendingVocabularyCard,
  type AnkiPendingWrittingCard,
  type AnkiSyncDirection,
} from "../types/anki";
import { fetchAnkiPendingSync, runAnkiSync } from "../utils/anki/ankiApi";
import ConfirmModal from "./ConfirmModal";

type SyncView = "overview" | "partial-push" | "partial-pull";

type PendingConfirm =
  | {
      direction: AnkiSyncDirection;
      type: "all" | "ignore_all" | "partial";
      selectedIds?: string[];
    }
  | null;

type AnkiSyncModalProps = {
  isOpen: boolean;
  kind: AnkiDeckKind | null;
  onCancel: () => void;
  onSynced: (direction: AnkiSyncDirection) => void;
};

function isVocabularyCard(
  card: AnkiPendingCard,
): card is AnkiPendingVocabularyCard {
  return "writting" in card;
}

function isWrittingCard(card: AnkiPendingCard): card is AnkiPendingWrittingCard {
  return "recto" in card;
}

function cardLabel(card: AnkiPendingCard): string {
  if (isVocabularyCard(card)) {
    return card.writting;
  }
  return card.verso;
}

function formatCount(count: number, singular: string, plural: string): string {
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}

function uniqueCharactersToCreate(cards: AnkiPendingCard[]): number {
  const seen = new Set<string>();
  for (const card of cards) {
    if (!isVocabularyCard(card)) {
      continue;
    }
    for (const char of card.characters_to_create ?? []) {
      seen.add(char);
    }
  }
  return seen.size;
}

function formatPullCharacterClause(characterCount: number): string {
  if (characterCount <= 0) {
    return "";
  }
  return (
    `, adding ${formatCount(characterCount, "character", "characters")}` +
    " to the character table"
  );
}

export default function AnkiSyncModal({
  isOpen,
  kind,
  onCancel,
  onSynced,
}: AnkiSyncModalProps) {
  const [pending, setPending] = useState<AnkiPendingSync | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<SyncView>("overview");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmAction, setConfirmAction] = useState<PendingConfirm>(null);
  const hskCharacterPinyin = useAppSelector(
    (state) => state.hskCharacters.pinyinByCharacter,
  );

  useEffect(() => {
    if (!isOpen || kind === null) {
      setPending(null);
      setIsLoading(false);
      setIsSubmitting(false);
      setError(null);
      setView("overview");
      setSelectedIds(new Set());
      setConfirmAction(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);
    setPending(null);
    setView("overview");
    setConfirmAction(null);

    void fetchAnkiPendingSync(kind, hskCharacterPinyin)
      .then((payload) => {
        if (!isMounted) {
          return;
        }
        const next: AnkiPendingSync = {
          ...payload,
          unsyncable: payload.unsyncable ?? [],
          pull_count: payload.pull_count ?? 0,
          pull_cards: payload.pull_cards ?? [],
          pull_characters_to_create_count:
            payload.pull_characters_to_create_count ??
            uniqueCharactersToCreate(payload.pull_cards ?? []),
          pull_missing: payload.pull_missing ?? [],
        };
        setPending(next);
        setSelectedIds(new Set(next.cards.map((card) => card.id)));
      })
      .catch((loadError: unknown) => {
        if (!isMounted) {
          return;
        }
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load pending Anki cards.",
        );
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, kind]);

  const pushCards = pending?.cards ?? [];
  const pullCards = pending?.pull_cards ?? [];
  const pushCount = pending?.count ?? 0;
  const pullCount = pending?.pull_count ?? 0;
  const pullActionableCount = pullCards.length;
  const pullCharactersToCreateCount =
    pending?.pull_characters_to_create_count ??
    uniqueCharactersToCreate(pullCards);
  const pullMissing = pending?.pull_missing ?? [];
  const canIgnoreAllPull = pullActionableCount > 0 || pullMissing.length > 0;
  const unsyncable = pending?.unsyncable ?? [];
  const cancelAllPushCount = pushCount + unsyncable.length;
  const canIgnoreAllPush = cancelAllPushCount > 0;
  const selectedCount = selectedIds.size;
  const activeCardCount =
    view === "partial-pull" ? pullActionableCount : pushCount;
  const ignoredCount = activeCardCount - selectedCount;
  const selectedPullCharactersToCreateCount = useMemo(() => {
    if (confirmAction?.direction !== "pull" || confirmAction.type !== "partial") {
      return 0;
    }
    const selected = new Set(confirmAction.selectedIds ?? []);
    return uniqueCharactersToCreate(
      pullCards.filter((card) => selected.has(card.id)),
    );
  }, [confirmAction, pullCards]);

  const confirmMessage = useMemo(() => {
    if (confirmAction === null || pending === null) {
      return "";
    }
    if (confirmAction.direction === "push") {
      if (confirmAction.type === "all") {
        return (
          `This action cannot be undone. It will push all ${pushCount} card` +
          `${pushCount === 1 ? "" : "s"} to the Anki deck.`
        );
      }
      if (confirmAction.type === "ignore_all") {
        if (pending.kind === "mandarin_writting") {
          return (
            `This action cannot be undone. All ${cancelAllPushCount} character` +
            `${cancelAllPushCount === 1 ? "" : "s"} with “written known” will be ` +
            "ignored for future pushes to Anki."
          );
        }
        return (
          `This action cannot be undone. All ${pushCount} card` +
          `${pushCount === 1 ? "" : "s"} will be ignored for future pushes to Anki.`
        );
      }
      return (
        `This action cannot be undone. ${selectedCount} card` +
        `${selectedCount === 1 ? "" : "s"} currently selected will be pushed ` +
        `to the Anki deck, and ${ignoredCount} card` +
        `${ignoredCount === 1 ? "" : "s"} not selected will be ignored for future pushes.`
      );
    }

    if (confirmAction.type === "all") {
      if (pending.kind === "mandarin_writting") {
        return (
          `This action cannot be undone. It will pull all ${pullActionableCount} character` +
          `${pullActionableCount === 1 ? "" : "s"} from Anki and mark them as “written known”.`
        );
      }
      return (
        `This action cannot be undone. It will pull all ${pullCount} card` +
        `${pullCount === 1 ? "" : "s"} from Anki into your knowledge base` +
        `${formatPullCharacterClause(pullCharactersToCreateCount)}.`
      );
    }
    if (confirmAction.type === "ignore_all") {
      const ignoreTotal = pullActionableCount + pullMissing.length;
      if (pending.kind === "mandarin_writting") {
        return (
          `This action cannot be undone. All ${ignoreTotal} character` +
          `${ignoreTotal === 1 ? "" : "s"} pending for pull (including warnings) ` +
          "will be ignored for future pulls from Anki."
        );
      }
      return (
        `This action cannot be undone. All ${ignoreTotal} card` +
        `${ignoreTotal === 1 ? "" : "s"} pending for pull (including warnings) ` +
        "will be ignored for future pulls from Anki."
      );
    }
    if (pending.kind === "mandarin_writting") {
      return (
        `This action cannot be undone. ${selectedCount} character` +
        `${selectedCount === 1 ? "" : "s"} currently selected will be marked as ` +
        `“written known”, and ${ignoredCount} character` +
        `${ignoredCount === 1 ? "" : "s"} not selected will be ignored for future pulls.`
      );
    }
    return (
      `This action cannot be undone. ${selectedCount} card` +
      `${selectedCount === 1 ? "" : "s"} currently selected will be pulled ` +
      `from Anki${formatPullCharacterClause(selectedPullCharactersToCreateCount)}, and ` +
      `${ignoredCount} card` +
      `${ignoredCount === 1 ? "" : "s"} not selected will be ignored for future pulls.`
    );
  }, [
    cancelAllPushCount,
    confirmAction,
    ignoredCount,
    pending,
    pullActionableCount,
    pullCharactersToCreateCount,
    pullCount,
    pullMissing.length,
    pushCount,
    selectedCount,
    selectedPullCharactersToCreateCount,
  ]);

  if (!isOpen || kind === null) {
    return null;
  }

  const label = ANKI_DECK_LABELS[kind];
  const isWritting = kind === "mandarin_writting";

  const toggleCard = (cardId: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      return next;
    });
  };

  const selectAll = (cards: AnkiPendingCard[]) => {
    setSelectedIds(new Set(cards.map((card) => card.id)));
  };

  const unselectAll = () => {
    setSelectedIds(new Set());
  };

  const openPartialPush = () => {
    setSelectedIds(new Set(pushCards.map((card) => card.id)));
    setView("partial-push");
  };

  const openPartialPull = () => {
    setSelectedIds(new Set(pullCards.map((card) => card.id)));
    setView("partial-pull");
  };

  const handlePullAction = (
    type: "all" | "ignore_all" | "partial",
  ) => {
    if (type === "partial") {
      openPartialPull();
      return;
    }
    setConfirmAction({ direction: "pull", type });
  };

  const handleConfirm = async () => {
    if (confirmAction === null || pending === null || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const action =
        confirmAction.type === "all"
          ? "synchronize_all"
          : confirmAction.type === "ignore_all"
            ? "cancel_all"
            : "partial";
      await runAnkiSync({
        kind,
        action,
        direction: confirmAction.direction,
        selectedIds:
          confirmAction.type === "partial"
            ? confirmAction.selectedIds
            : undefined,
        hskCharacterPinyin,
      });
      setConfirmAction(null);
      onSynced(confirmAction.direction);
    } catch (submitError: unknown) {
      setConfirmAction(null);
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to synchronize with Anki.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderVocabularyPartialList = (cards: AnkiPendingCard[]) => (
    <>
      <div className="anki-sync-card-row anki-sync-card-row--header">
        <span className="anki-sync-card-check" aria-hidden="true" />
        <span>Writting</span>
        <span>Pinyin</span>
        <span>Definition</span>
      </div>
      {cards.filter(isVocabularyCard).map((card) => {
        const checked = selectedIds.has(card.id);
        return (
          <label key={card.id} className="anki-sync-card-row" role="listitem">
            <span className="anki-sync-card-check">
              <input
                type="checkbox"
                checked={checked}
                disabled={isSubmitting}
                onChange={() => toggleCard(card.id)}
                aria-label={`Select ${card.writting}`}
              />
            </span>
            <span className="anki-sync-card-writting">{card.writting}</span>
            <span>{card.pinyin}</span>
            <span>{card.definition}</span>
          </label>
        );
      })}
    </>
  );

  return (
    <>
      <div className="modal-overlay" onClick={onCancel}>
        <div
          className={`modal-dialog anki-sync-modal${
            view !== "overview" ? " anki-sync-modal--partial" : ""
          }`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="anki-sync-modal-title"
          onClick={(event) => event.stopPropagation()}
        >
          <h2 id="anki-sync-modal-title" className="modal-title">
            Sync — {label}
          </h2>

          {isLoading && <p className="modal-message">Loading sync status…</p>}

          {!isLoading && error !== null && (
            <p className="table-error" role="alert">
              {error}
            </p>
          )}

          {!isLoading && pending !== null && view === "overview" && (
            <>
              <p className="anki-sync-lead">
                Choose a direction. Push sends local knowledge-base content to
                Anki. Pull imports Anki cards into the app.
              </p>

              <section className="anki-sync-panel anki-sync-panel--push">
                <div className="anki-sync-panel-header">
                  <h3 className="anki-sync-panel-title">Push to Anki</h3>
                  <p className="anki-sync-panel-count">
                    {formatCount(pushCount, "card to push", "cards to push")}
                  </p>
                </div>
                <p className="anki-sync-panel-copy">
                  One-way only: add new local cards to this Anki deck, or ignore
                  them so they are not offered again.
                </p>

                <div className="anki-sync-actions">
                  <button
                    type="button"
                    className="modal-button-confirm-primary"
                    disabled={pushCount === 0 || isSubmitting}
                    onClick={() =>
                      setConfirmAction({ direction: "push", type: "all" })
                    }
                  >
                    Push all to Anki
                  </button>
                  <button
                    type="button"
                    className="modal-button-confirm"
                    disabled={!canIgnoreAllPush || isSubmitting}
                    onClick={() =>
                      setConfirmAction({
                        direction: "push",
                        type: "ignore_all",
                      })
                    }
                  >
                    Ignore all for push
                  </button>
                  <button
                    type="button"
                    className="page-add-button"
                    disabled={pushCount === 0 || isSubmitting}
                    onClick={openPartialPush}
                  >
                    Choose what to push
                  </button>
                </div>

                {isWritting && unsyncable.length > 0 && (
                  <div className="anki-sync-unsyncable" role="note">
                    <p className="anki-sync-unsyncable-title">
                      Characters that cannot be pushed
                    </p>
                    <p className="anki-sync-unsyncable-text">
                      These characters are not connected to a word with a
                      definition (using only characters marked as “written
                      known”):{" "}
                      <span className="anki-sync-unsyncable-chars">
                        {unsyncable.join("、")}
                      </span>
                      . You can skip them with “Ignore all for push”.
                    </p>
                  </div>
                )}
              </section>

              <section className="anki-sync-panel anki-sync-panel--pull">
                <div className="anki-sync-panel-header">
                  <h3 className="anki-sync-panel-title">Pull from Anki</h3>
                  <p className="anki-sync-panel-count">
                    {formatCount(
                      pullCount,
                      isWritting ? "character to pull" : "card to pull",
                      isWritting ? "characters to pull" : "cards to pull",
                    )}
                  </p>
                </div>
                <p className="anki-sync-panel-copy">
                  {isWritting
                    ? "Characters found in this Anki deck that exist in your knowledge base but are not yet marked as “written known”."
                    : "Cards found in this Anki deck that are not yet in your knowledge base."}
                </p>

                <div className="anki-sync-actions">
                  <button
                    type="button"
                    className="modal-button-confirm-primary"
                    disabled={pullActionableCount === 0 || isSubmitting}
                    onClick={() => handlePullAction("all")}
                  >
                    Pull all from Anki
                  </button>
                  <button
                    type="button"
                    className="modal-button-confirm"
                    disabled={!canIgnoreAllPull || isSubmitting}
                    onClick={() => handlePullAction("ignore_all")}
                  >
                    Ignore all for pull
                  </button>
                  <button
                    type="button"
                    className="page-add-button"
                    disabled={pullActionableCount === 0 || isSubmitting}
                    onClick={() => handlePullAction("partial")}
                  >
                    Choose what to pull
                  </button>
                </div>

                {isWritting && pullMissing.length > 0 && (
                  <div className="anki-sync-unsyncable" role="note">
                    <p className="anki-sync-unsyncable-title">
                      Characters not yet in the knowledge base
                    </p>
                    <p className="anki-sync-unsyncable-text">
                      These characters from Anki are not yet part of a known
                      word. Add them manually in the app, or synchronize the
                      Mandarin vocabulary deck with a word that includes them
                      first:{" "}
                      <span className="anki-sync-unsyncable-chars">
                        {pullMissing.join("、")}
                      </span>
                      .
                    </p>
                  </div>
                )}

                {!isWritting && pullMissing.length > 0 && (
                  <div className="anki-sync-unsyncable" role="note">
                    <p className="anki-sync-unsyncable-title">
                      Cards that cannot be pulled
                    </p>
                    <p className="anki-sync-unsyncable-text">
                      These Anki cards contain Chinese characters whose pinyin
                      could not be resolved from the deck:{" "}
                      <span className="anki-sync-unsyncable-chars">
                        {pullMissing.join("、")}
                      </span>
                      .
                    </p>
                  </div>
                )}
              </section>

              <div className="modal-actions anki-sync-footer">
                <button
                  type="button"
                  className="modal-button-cancel"
                  disabled={isSubmitting}
                  onClick={onCancel}
                >
                  Close
                </button>
              </div>
            </>
          )}

          {!isLoading && pending !== null && view === "partial-push" && (
            <>
              <p className="modal-message">
                Choose which cards to push to Anki. Unselected cards will be
                ignored for future pushes.
              </p>

              <div className="anki-sync-partial-toolbar">
                <button
                  type="button"
                  className="page-add-button"
                  onClick={() => selectAll(pushCards)}
                  disabled={isSubmitting}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="page-add-button"
                  onClick={unselectAll}
                  disabled={isSubmitting}
                >
                  Unselect all
                </button>
                <span className="anki-sync-partial-count">
                  {selectedCount} of {pushCount} selected
                </span>
              </div>

              <div className="anki-sync-card-list" role="list">
                {isWritting ? (
                  <>
                    <div className="anki-sync-card-row anki-sync-card-row--header anki-sync-card-row--writting">
                      <span className="anki-sync-card-check" aria-hidden="true" />
                      <span>Recto</span>
                      <span>Verso</span>
                    </div>
                    {pushCards.filter(isWrittingCard).map((card) => {
                      const checked = selectedIds.has(card.id);
                      return (
                        <label
                          key={card.id}
                          className="anki-sync-card-row anki-sync-card-row--writting"
                          role="listitem"
                        >
                          <span className="anki-sync-card-check">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={isSubmitting}
                              onChange={() => toggleCard(card.id)}
                              aria-label={`Select ${cardLabel(card)}`}
                            />
                          </span>
                          <span>{card.recto}</span>
                          <span className="anki-sync-card-writting">
                            {card.verso}
                          </span>
                        </label>
                      );
                    })}
                  </>
                ) : (
                  renderVocabularyPartialList(pushCards)
                )}
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-button-cancel"
                  disabled={isSubmitting}
                  onClick={() => setView("overview")}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="modal-button-confirm-primary"
                  disabled={isSubmitting}
                  onClick={() =>
                    setConfirmAction({
                      direction: "push",
                      type: "partial",
                      selectedIds: Array.from(selectedIds),
                    })
                  }
                >
                  Confirm push
                </button>
              </div>
            </>
          )}

          {!isLoading && pending !== null && view === "partial-pull" && (
            <>
              <p className="modal-message">
                {isWritting
                  ? "Choose which characters to mark as “written known”. Unselected characters will be ignored for future pulls."
                  : "Choose which cards to pull from Anki. Unselected cards will be ignored for future pulls."}
              </p>

              <div className="anki-sync-partial-toolbar">
                <button
                  type="button"
                  className="page-add-button"
                  onClick={() => selectAll(pullCards)}
                  disabled={isSubmitting}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="page-add-button"
                  onClick={unselectAll}
                  disabled={isSubmitting}
                >
                  Unselect all
                </button>
                <span className="anki-sync-partial-count">
                  {selectedCount} of {pullActionableCount} selected
                </span>
              </div>

              <div className="anki-sync-card-list" role="list">
                {isWritting ? (
                  <>
                    <div className="anki-sync-card-row anki-sync-card-row--header anki-sync-card-row--writting">
                      <span className="anki-sync-card-check" aria-hidden="true" />
                      <span>Pinyin</span>
                      <span>Character</span>
                    </div>
                    {pullCards.filter(isWrittingCard).map((card) => {
                      const checked = selectedIds.has(card.id);
                      return (
                        <label
                          key={card.id}
                          className="anki-sync-card-row anki-sync-card-row--writting"
                          role="listitem"
                        >
                          <span className="anki-sync-card-check">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={isSubmitting}
                              onChange={() => toggleCard(card.id)}
                              aria-label={`Select ${cardLabel(card)}`}
                            />
                          </span>
                          <span>{card.recto}</span>
                          <span className="anki-sync-card-writting">
                            {card.verso}
                          </span>
                        </label>
                      );
                    })}
                  </>
                ) : (
                  renderVocabularyPartialList(pullCards)
                )}
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-button-cancel"
                  disabled={isSubmitting}
                  onClick={() => setView("overview")}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="modal-button-confirm-primary"
                  disabled={isSubmitting}
                  onClick={() =>
                    setConfirmAction({
                      direction: "pull",
                      type: "partial",
                      selectedIds: Array.from(selectedIds),
                    })
                  }
                >
                  Confirm pull
                </button>
              </div>
            </>
          )}

          {!isLoading && error !== null && pending === null && (
            <div className="modal-actions">
              <button
                type="button"
                className="modal-button-cancel"
                onClick={onCancel}
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmAction !== null}
        message={confirmMessage}
        onCancel={() => {
          if (!isSubmitting) {
            setConfirmAction(null);
          }
        }}
        onConfirm={() => {
          void handleConfirm();
        }}
      />
    </>
  );
}
