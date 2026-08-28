import { useEffect, useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useAppSelector } from "../store/hooks";
import { CheckIcon } from "./icons";
import {
  type AnkiDeckKind,
  type AnkiPendingCard,
  type AnkiPendingSync,
  type AnkiPendingVocabularyCard,
  type AnkiPendingWritingCard,
  type AnkiSyncDirection,
  type AnkiSyncResult,
} from "../types/anki";
import { fetchAnkiPendingSync, runAnkiSync } from "../utils/anki/ankiApi";
import Button from "./Button";
import ConfirmModal from "./ConfirmModal";
import styles from "./AnkiSyncModal.module.css";

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
  onSynced: (direction: AnkiSyncDirection, result: AnkiSyncResult) => void;
};

function isVocabularyCard(
  card: AnkiPendingCard,
): card is AnkiPendingVocabularyCard {
  return "writing" in card;
}

function isWritingCard(card: AnkiPendingCard): card is AnkiPendingWritingCard {
  return "recto" in card;
}

function cardLabel(card: AnkiPendingCard): string {
  if (isVocabularyCard(card)) {
    return card.writing;
  }
  return card.verso;
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

function formatPullCharacterClause(
  characterCount: number,
  t: TFunction<"preferences">,
): string {
  if (characterCount <= 0) {
    return "";
  }
  return t("ankiSyncModal.confirm.pullCharacterClause", {
    count: characterCount,
  });
}

export default function AnkiSyncModal({
  isOpen,
  kind,
  onCancel,
  onSynced,
}: AnkiSyncModalProps) {
  const { t } = useTranslation("preferences");
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
            : t("ankiSyncModal.errors.loadPending"),
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
  }, [isOpen, kind, t]);

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
  const nothingToPush = !canIgnoreAllPush;
  const nothingToPull = !canIgnoreAllPull;
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
    const prefix = t("ankiSyncModal.confirm.irreversiblePrefix");
    if (confirmAction.direction === "push") {
      if (confirmAction.type === "all") {
        return `${prefix} ${t("ankiSyncModal.confirm.pushAllMessage", { count: pushCount })}`;
      }
      if (confirmAction.type === "ignore_all") {
        if (pending.kind === "mandarin_writing") {
          return `${prefix} ${t("ankiSyncModal.confirm.pushIgnoreAllWritingMessage", { count: cancelAllPushCount })}`;
        }
        return `${prefix} ${t("ankiSyncModal.confirm.pushIgnoreAllMessage", { count: pushCount })}`;
      }
      return (
        `${prefix} ${t("ankiSyncModal.confirm.pushPartialSelected", { count: selectedCount })}, ` +
        `and ${t("ankiSyncModal.confirm.pushPartialIgnored", { count: ignoredCount })}`
      );
    }

    if (confirmAction.type === "all") {
      if (pending.kind === "mandarin_writing") {
        return `${prefix} ${t("ankiSyncModal.confirm.pullAllWritingMessage", { count: pullActionableCount })}`;
      }
      return `${prefix} ${t("ankiSyncModal.confirm.pullAllMessage", {
        count: pullCount,
        characterClause: formatPullCharacterClause(pullCharactersToCreateCount, t),
      })}`;
    }
    if (confirmAction.type === "ignore_all") {
      const ignoreTotal = pullActionableCount + pullMissing.length;
      return `${prefix} ${t("ankiSyncModal.confirm.pullIgnoreAllMessage", { count: ignoreTotal })}`;
    }
    if (pending.kind === "mandarin_writing") {
      return (
        `${prefix} ${t("ankiSyncModal.confirm.pullPartialWritingSelected", { count: selectedCount })}, ` +
        `and ${t("ankiSyncModal.confirm.pullPartialWritingIgnored", { count: ignoredCount })}`
      );
    }
    return (
      `${prefix} ${t("ankiSyncModal.confirm.pullPartialSelected", {
        count: selectedCount,
        characterClause: formatPullCharacterClause(selectedPullCharactersToCreateCount, t),
      })}, ` + `and ${t("ankiSyncModal.confirm.pullPartialIgnored", { count: ignoredCount })}`
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
    t,
  ]);

  if (!isOpen || kind === null) {
    return null;
  }

  const label = t(`ankiDeckKind.labels.${kind}`);
  const isWriting = kind === "mandarin_writing";

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
      const result = await runAnkiSync({
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
      onSynced(confirmAction.direction, result);
    } catch (submitError: unknown) {
      setConfirmAction(null);
      setError(
        submitError instanceof Error
          ? submitError.message
          : t("ankiSyncModal.errors.sync"),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderVocabularyPartialList = (cards: AnkiPendingCard[]) => (
    <>
      <div className={`${styles.ankiSyncCardRow} ${styles.ankiSyncCardRowHeader}`}>
        <span className={styles.ankiSyncCardCheck} aria-hidden="true" />
        <span>{t("ankiSyncModal.partial.columnWriting")}</span>
        <span>{t("ankiSyncModal.partial.columnPinyin")}</span>
        <span>{t("ankiSyncModal.partial.columnDefinition")}</span>
      </div>
      {cards.filter(isVocabularyCard).map((card) => {
        const checked = selectedIds.has(card.id);
        return (
          <label key={card.id} className={styles.ankiSyncCardRow} role="listitem">
            <span className={styles.ankiSyncCardCheck}>
              <input
                type="checkbox"
                checked={checked}
                disabled={isSubmitting}
                onChange={() => toggleCard(card.id)}
                aria-label={t("ankiSyncModal.partial.selectCardAriaLabel", { name: card.writing })}
              />
            </span>
            <span className={styles.ankiSyncCardWriting}>{card.writing}</span>
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
          className={`modal-dialog ${styles.ankiSyncModal}${
            view !== "overview" ? ` ${styles.ankiSyncModalPartial}` : ""
          }`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="anki-sync-modal-title"
          onClick={(event) => event.stopPropagation()}
        >
          <h2 id="anki-sync-modal-title" className="modal-title">
            {t("ankiSyncModal.title", { label })}
          </h2>

          {isLoading && <p className="modal-message">{t("ankiSyncModal.loadingSyncStatus")}</p>}

          {!isLoading && error !== null && (
            <p className="table-error" role="alert">
              {error}
            </p>
          )}

          {!isLoading && pending !== null && view === "overview" && (
            <>
              <p className={styles.ankiSyncLead}>
                {t("ankiSyncModal.overview.lead")}
              </p>

              <section className={`${styles.ankiSyncPanel}`}>
                <div className={styles.ankiSyncPanelHeader}>
                  <h3 className={styles.ankiSyncPanelTitle}>
                    {t("ankiSyncModal.overview.push.title")}
                  </h3>
                  <p className={styles.ankiSyncPanelCount}>
                    {t("ankiSyncModal.overview.push.countLabel", { count: pushCount })}
                  </p>
                </div>
                <p className={styles.ankiSyncPanelCopy}>
                  {t("ankiSyncModal.overview.push.copy")}
                </p>

                {nothingToPush ? (
                  <div className={styles.ankiSyncAllSet} role="status">
                    <CheckIcon className={styles.ankiSyncAllSetIcon} />
                    <p className={styles.ankiSyncAllSetText}>
                      {t("ankiSyncModal.overview.push.allSet")}
                    </p>
                  </div>
                ) : (
                  <div className={styles.ankiSyncActions}>
                    <Button
                      kind="confirm"
                      text={t("ankiSyncModal.overview.push.pushAllButton")}
                      disabled={pushCount === 0 || isSubmitting}
                      onClick={() =>
                        setConfirmAction({ direction: "push", type: "all" })
                      }
                    />
                    <Button
                      kind="danger"
                      text={t("ankiSyncModal.overview.push.ignoreAllButton")}
                      disabled={!canIgnoreAllPush || isSubmitting}
                      onClick={() =>
                        setConfirmAction({
                          direction: "push",
                          type: "ignore_all",
                        })
                      }
                    />
                    <Button
                      kind="confirm"
                      text={t("ankiSyncModal.overview.push.chooseButton")}
                      disabled={pushCount === 0 || isSubmitting}
                      onClick={openPartialPush}
                    />
                  </div>
                )}

                {isWriting && unsyncable.length > 0 && (
                  <div className={styles.ankiSyncUnsyncable} role="note">
                    <p className={styles.ankiSyncUnsyncableTitle}>
                      {t("ankiSyncModal.overview.push.unsyncableTitle")}
                    </p>
                    <p className={styles.ankiSyncUnsyncableText}>
                      <Trans
                        i18nKey="ankiSyncModal.overview.push.unsyncableText"
                        t={t}
                        values={{ words: unsyncable.join("、") }}
                        components={{
                          1: <span className={styles.ankiSyncUnsyncableChars} />,
                        }}
                      />
                    </p>
                  </div>
                )}
              </section>

              <section className={`${styles.ankiSyncPanel}`}>
                <div className={styles.ankiSyncPanelHeader}>
                  <h3 className={styles.ankiSyncPanelTitle}>
                    {t("ankiSyncModal.overview.pull.title")}
                  </h3>
                  <p className={styles.ankiSyncPanelCount}>
                    {isWriting
                      ? t("ankiSyncModal.overview.pull.wordCountLabel", { count: pullCount })
                      : t("ankiSyncModal.overview.pull.cardCountLabel", { count: pullCount })}
                  </p>
                </div>
                <p className={styles.ankiSyncPanelCopy}>
                  {isWriting
                    ? t("ankiSyncModal.overview.pull.copyWriting")
                    : t("ankiSyncModal.overview.pull.copyNonWriting")}
                </p>

                {nothingToPull ? (
                  <div className={styles.ankiSyncAllSet} role="status">
                    <CheckIcon className={styles.ankiSyncAllSetIcon} />
                    <p className={styles.ankiSyncAllSetText}>
                      {t("ankiSyncModal.overview.pull.allSet")}
                    </p>
                  </div>
                ) : (
                  <div className={styles.ankiSyncActions}>
                    <Button
                      kind="confirm"
                      text={t("ankiSyncModal.overview.pull.pullAllButton")}
                      disabled={pullActionableCount === 0 || isSubmitting}
                      onClick={() => handlePullAction("all")}
                    />
                    <Button
                      kind="danger"
                      text={t("ankiSyncModal.overview.pull.ignoreAllButton")}
                      disabled={!canIgnoreAllPull || isSubmitting}
                      onClick={() => handlePullAction("ignore_all")}
                    />
                    <Button
                      kind="confirm"
                      text={t("ankiSyncModal.overview.pull.chooseButton")}
                      disabled={pullActionableCount === 0 || isSubmitting}
                      onClick={() => handlePullAction("partial")}
                    />
                  </div>
                )}

                {isWriting && pullMissing.length > 0 && (
                  <div className={styles.ankiSyncUnsyncable} role="note">
                    <p className={styles.ankiSyncUnsyncableTitle}>
                      {t("ankiSyncModal.overview.pull.missingWritingTitle")}
                    </p>
                    <p className={styles.ankiSyncUnsyncableText}>
                      <Trans
                        i18nKey="ankiSyncModal.overview.pull.missingWritingText"
                        t={t}
                        values={{ words: pullMissing.join("、") }}
                        components={{
                          1: <span className={styles.ankiSyncUnsyncableChars} />,
                        }}
                      />
                    </p>
                  </div>
                )}

                {!isWriting && pullMissing.length > 0 && (
                  <div className={styles.ankiSyncUnsyncable} role="note">
                    <p className={styles.ankiSyncUnsyncableTitle}>
                      {t("ankiSyncModal.overview.pull.missingNonWritingTitle")}
                    </p>
                    <p className={styles.ankiSyncUnsyncableText}>
                      <Trans
                        i18nKey="ankiSyncModal.overview.pull.missingNonWritingText"
                        t={t}
                        values={{ words: pullMissing.join("、") }}
                        components={{
                          1: <span className={styles.ankiSyncUnsyncableChars} />,
                        }}
                      />
                    </p>
                  </div>
                )}
              </section>

              <div className={`modal-actions ${styles.ankiSyncFooter}`}>
                <Button
                  kind="cancel"
                  text={t("ankiSyncModal.close")}
                  disabled={isSubmitting}
                  onClick={onCancel}
                />
              </div>
            </>
          )}

          {!isLoading && pending !== null && view === "partial-push" && (
            <>
              <p className="modal-message">
                {t("ankiSyncModal.partial.pushMessage")}
              </p>

              <div className={styles.ankiSyncPartialToolbar}>
                <Button
                  kind="confirm"
                  text={t("ankiSyncModal.partial.selectAll")}
                  onClick={() => selectAll(pushCards)}
                  disabled={isSubmitting}
                />
                <Button
                  kind="confirm"
                  text={t("ankiSyncModal.partial.unselectAll")}
                  onClick={unselectAll}
                  disabled={isSubmitting}
                />
                <span className={styles.ankiSyncPartialCount}>
                  {t("ankiSyncModal.partial.selectedOfTotal", {
                    selected: selectedCount,
                    total: pushCount,
                  })}
                </span>
              </div>

              <div className={styles.ankiSyncCardList} role="list">
                {isWriting ? (
                  <>
                    <div className={`${styles.ankiSyncCardRow} ${styles.ankiSyncCardRowHeader} ${styles.ankiSyncCardRowWriting}`}>
                      <span className={styles.ankiSyncCardCheck} aria-hidden="true" />
                      <span>{t("ankiSyncModal.partial.columnRecto")}</span>
                      <span>{t("ankiSyncModal.partial.columnVerso")}</span>
                    </div>
                    {pushCards.filter(isWritingCard).map((card) => {
                      const checked = selectedIds.has(card.id);
                      return (
                        <label
                          key={card.id}
                          className={`${styles.ankiSyncCardRow} ${styles.ankiSyncCardRowWriting}`}
                          role="listitem"
                        >
                          <span className={styles.ankiSyncCardCheck}>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={isSubmitting}
                              onChange={() => toggleCard(card.id)}
                              aria-label={t("ankiSyncModal.partial.selectCardAriaLabel", { name: cardLabel(card) })}
                            />
                          </span>
                          <span>{card.recto}</span>
                          <span className={styles.ankiSyncCardWriting}>
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
                <Button
                  kind="cancel"
                  text={t("ankiSyncModal.partial.backButton")}
                  disabled={isSubmitting}
                  onClick={() => setView("overview")}
                />
                <Button
                  kind="confirm"
                  text={t("ankiSyncModal.partial.confirmPushButton")}
                  disabled={isSubmitting}
                  onClick={() =>
                    setConfirmAction({
                      direction: "push",
                      type: "partial",
                      selectedIds: Array.from(selectedIds),
                    })
                  }
                />
              </div>
            </>
          )}

          {!isLoading && pending !== null && view === "partial-pull" && (
            <>
              <p className="modal-message">
                {isWriting
                  ? t("ankiSyncModal.partial.pullMessageWriting")
                  : t("ankiSyncModal.partial.pullMessageNonWriting")}
              </p>

              <div className={styles.ankiSyncPartialToolbar}>
                <Button
                  kind="confirm"
                  text={t("ankiSyncModal.partial.selectAll")}
                  onClick={() => selectAll(pullCards)}
                  disabled={isSubmitting}
                />
                <Button
                  kind="confirm"
                  text={t("ankiSyncModal.partial.unselectAll")}
                  onClick={unselectAll}
                  disabled={isSubmitting}
                />
                <span className={styles.ankiSyncPartialCount}>
                  {t("ankiSyncModal.partial.selectedOfTotal", {
                    selected: selectedCount,
                    total: pullActionableCount,
                  })}
                </span>
              </div>

              <div className={styles.ankiSyncCardList} role="list">
                {isWriting ? (
                  <>
                    <div className={`${styles.ankiSyncCardRow} ${styles.ankiSyncCardRowHeader} ${styles.ankiSyncCardRowWriting}`}>
                      <span className={styles.ankiSyncCardCheck} aria-hidden="true" />
                      <span>{t("ankiSyncModal.partial.columnRecto")}</span>
                      <span>{t("ankiSyncModal.partial.columnVerso")}</span>
                    </div>
                    {pullCards.filter(isWritingCard).map((card) => {
                      const checked = selectedIds.has(card.id);
                      return (
                        <label
                          key={card.id}
                          className={`${styles.ankiSyncCardRow} ${styles.ankiSyncCardRowWriting}`}
                          role="listitem"
                        >
                          <span className={styles.ankiSyncCardCheck}>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={isSubmitting}
                              onChange={() => toggleCard(card.id)}
                              aria-label={t("ankiSyncModal.partial.selectCardAriaLabel", { name: cardLabel(card) })}
                            />
                          </span>
                          <span>{card.recto}</span>
                          <span className={styles.ankiSyncCardWriting}>
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
                <Button
                  kind="cancel"
                  text={t("ankiSyncModal.partial.backButton")}
                  disabled={isSubmitting}
                  onClick={() => setView("overview")}
                />
                <Button
                  kind="confirm"
                  text={t("ankiSyncModal.partial.confirmPullButton")}
                  disabled={isSubmitting}
                  onClick={() =>
                    setConfirmAction({
                      direction: "pull",
                      type: "partial",
                      selectedIds: Array.from(selectedIds),
                    })
                  }
                />
              </div>
            </>
          )}

          {!isLoading && error !== null && pending === null && (
            <div className="modal-actions">
              <Button kind="cancel" text={t("ankiSyncModal.close")} onClick={onCancel} />
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
