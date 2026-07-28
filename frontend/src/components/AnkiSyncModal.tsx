import { useEffect, useMemo, useState } from "react";
import {
  ANKI_DECK_LABELS,
  type AnkiDeckKind,
  type AnkiPendingCard,
  type AnkiPendingSync,
  type AnkiPendingVocabularyCard,
  type AnkiPendingWrittingCard,
} from "../types/anki";
import { fetchAnkiPendingSync, runAnkiSync } from "../utils/ankiApi";
import ConfirmModal from "./ConfirmModal";

type SyncView = "overview" | "partial";

type PendingConfirm =
  | { type: "synchronize_all" }
  | { type: "cancel_all" }
  | { type: "partial"; selectedIds: string[] }
  | null;

type AnkiSyncModalProps = {
  isOpen: boolean;
  kind: AnkiDeckKind | null;
  onCancel: () => void;
  onSynced: () => void;
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

    void fetchAnkiPendingSync(kind)
      .then((payload) => {
        if (!isMounted) {
          return;
        }
        setPending({
          ...payload,
          unsyncable: payload.unsyncable ?? [],
        });
        setSelectedIds(new Set(payload.cards.map((card) => card.id)));
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

  const selectedCount = selectedIds.size;
  const ignoredCount = (pending?.count ?? 0) - selectedCount;
  const unsyncable = pending?.unsyncable ?? [];
  const cancelAllCount = (pending?.count ?? 0) + unsyncable.length;
  const canCancelAll = cancelAllCount > 0;

  const confirmMessage = useMemo(() => {
    if (confirmAction === null || pending === null) {
      return "";
    }
    const total = pending.count;
    if (confirmAction.type === "synchronize_all") {
      return (
        `This action cannot be undone. It will add all ${total} card` +
        `${total === 1 ? "" : "s"} to the Anki deck.`
      );
    }
    if (confirmAction.type === "cancel_all") {
      if (pending.kind === "mandarin_writting") {
        return (
          `This action cannot be undone. All ${cancelAllCount} character` +
          `${cancelAllCount === 1 ? "" : "s"} with “written known” will be ` +
          "ignored for future synchronization."
        );
      }
      return (
        `This action cannot be undone. All ${total} card` +
        `${total === 1 ? "" : "s"} will be ignored for future synchronization.`
      );
    }
    return (
      `This action cannot be undone. ${selectedCount} card` +
      `${selectedCount === 1 ? "" : "s"} currently selected will be synchronized ` +
      `with the Anki deck, and ${ignoredCount} card` +
      `${ignoredCount === 1 ? "" : "s"} not selected will be ignored.`
    );
  }, [cancelAllCount, confirmAction, ignoredCount, pending, selectedCount]);

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

  const selectAll = () => {
    if (pending === null) {
      return;
    }
    setSelectedIds(new Set(pending.cards.map((card) => card.id)));
  };

  const unselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleConfirm = async () => {
    if (confirmAction === null || pending === null || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (confirmAction.type === "synchronize_all") {
        await runAnkiSync({ kind, action: "synchronize_all" });
      } else if (confirmAction.type === "cancel_all") {
        await runAnkiSync({ kind, action: "cancel_all" });
      } else {
        await runAnkiSync({
          kind,
          action: "partial",
          selectedIds: confirmAction.selectedIds,
        });
      }
      setConfirmAction(null);
      onSynced();
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

  return (
    <>
      <div className="modal-overlay" onClick={onCancel}>
        <div
          className={`modal-dialog anki-sync-modal${
            view === "partial" ? " anki-sync-modal--partial" : ""
          }`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="anki-sync-modal-title"
          onClick={(event) => event.stopPropagation()}
        >
          <h2 id="anki-sync-modal-title" className="modal-title">
            Synchronize {label}
          </h2>

          {isLoading && <p className="modal-message">Loading pending cards…</p>}

          {!isLoading && error !== null && (
            <p className="table-error" role="alert">
              {error}
            </p>
          )}

          {!isLoading && pending !== null && view === "overview" && (
            <>
              <p className="modal-message">
                {pending.count === 0
                  ? "There are no elements that need to be synchronized."
                  : pending.count === 1
                    ? "1 element needs to be synchronized."
                    : `${pending.count} elements need to be synchronized.`}
              </p>

              <div className="anki-sync-actions">
                <button
                  type="button"
                  className="modal-button-confirm-primary"
                  disabled={pending.count === 0 || isSubmitting}
                  onClick={() => setConfirmAction({ type: "synchronize_all" })}
                >
                  Synchronize all
                </button>
                <button
                  type="button"
                  className="modal-button-confirm"
                  disabled={!canCancelAll || isSubmitting}
                  onClick={() => setConfirmAction({ type: "cancel_all" })}
                >
                  Cancel all synchronization
                </button>
                <button
                  type="button"
                  className="page-add-button"
                  disabled={pending.count === 0 || isSubmitting}
                  onClick={() => setView("partial")}
                >
                  Partial synchronization
                </button>
                <button
                  type="button"
                  className="modal-button-cancel"
                  disabled={isSubmitting}
                  onClick={onCancel}
                >
                  Cancel
                </button>
              </div>

              {isWritting && unsyncable.length > 0 && (
                <div className="anki-sync-unsyncable" role="note">
                  <p className="anki-sync-unsyncable-title">
                    Characters that cannot be synchronized
                  </p>
                  <p className="anki-sync-unsyncable-text">
                    These characters are not connected to a word with a
                    definition (using only characters marked as “written
                    known”):{" "}
                    <span className="anki-sync-unsyncable-chars">
                      {unsyncable.join("、")}
                    </span>
                    . You can ignore synchronization for all of them by choosing
                    “Cancel all synchronization”.
                  </p>
                </div>
              )}
            </>
          )}

          {!isLoading && pending !== null && view === "partial" && (
            <>
              <p className="modal-message">
                Choose which cards to add to Anki. Unselected cards will be
                ignored for future synchronization.
              </p>

              <div className="anki-sync-partial-toolbar">
                <button
                  type="button"
                  className="page-add-button"
                  onClick={selectAll}
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
                  {selectedCount} of {pending.count} selected
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
                    {pending.cards.filter(isWrittingCard).map((card) => {
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
                  <>
                    <div className="anki-sync-card-row anki-sync-card-row--header">
                      <span className="anki-sync-card-check" aria-hidden="true" />
                      <span>Writting</span>
                      <span>Pinyin</span>
                      <span>Definition</span>
                    </div>
                    {pending.cards.filter(isVocabularyCard).map((card) => {
                      const checked = selectedIds.has(card.id);
                      return (
                        <label
                          key={card.id}
                          className="anki-sync-card-row"
                          role="listitem"
                        >
                          <span className="anki-sync-card-check">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={isSubmitting}
                              onChange={() => toggleCard(card.id)}
                              aria-label={`Select ${card.writting}`}
                            />
                          </span>
                          <span className="anki-sync-card-writting">
                            {card.writting}
                          </span>
                          <span>{card.pinyin}</span>
                          <span>{card.definition}</span>
                        </label>
                      );
                    })}
                  </>
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
                      type: "partial",
                      selectedIds: Array.from(selectedIds),
                    })
                  }
                >
                  Confirm
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
