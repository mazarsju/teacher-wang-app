import { useCallback, useEffect, useState } from "react";
import AnkiConnectGuideModal from "../components/AnkiConnectGuideModal";
import AnkiDeckSetupModal from "../components/AnkiDeckSetupModal";
import AnkiSyncHelpModal from "../components/AnkiSyncHelpModal";
import AnkiSyncModal from "../components/AnkiSyncModal";
import ConfirmModal from "../components/ConfirmModal";
import { InfoIcon, SettingsIcon, SyncIcon, TrashIcon } from "../components/icons";
import Page from "../components/Page";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { setAnkiStatus } from "../store/slices/ankiSlice";
import { resetKnowledgeBaseData, syncAppData } from "../store/thunks/syncAppData";
import {
  ANKI_DECK_LABELS,
  ANKI_DECK_ORDER,
  type AnkiDeckKind,
  type AnkiDeckStatus,
  type AnkiSyncDirection,
} from "../types/anki";
import type { TokenUsageSummary } from "../types/tokenUsage";
import { fetchAnkiStatus } from "../utils/anki/ankiApi";
import { fetchTokenUsage } from "../utils/aiChat/tokenUsageApi";
import { deleteKnowledgeBase } from "../utils/knowledgeBase/knowledgeBaseApi";

function formatDayLabel(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatTokenCount(value: number): string {
  return value.toLocaleString();
}

function clampToken(value: number, max: number): number {
  return Math.min(max, Math.max(0, value));
}

function formatDeckStatus(status: AnkiDeckStatus): string {
  switch (status) {
    case "not_configured":
      return "Not configured";
    case "synchronized":
      return "Synchronized";
    case "not_synchronized":
      return "Not synchronized";
  }
}

export default function PreferencesPage() {
  const dispatch = useAppDispatch();
  const ankiStatus = useAppSelector((state) => state.anki.status);
  const syncStatus = useAppSelector((state) => state.sync.status);
  const syncError = useAppSelector((state) => state.sync.error);
  const lastSyncedAt = useAppSelector((state) => state.sync.lastSyncedAt);

  const [tokenUsage, setTokenUsage] = useState<TokenUsageSummary | null>(null);
  const [isTokenUsageLoading, setIsTokenUsageLoading] = useState(true);
  const [extrasError, setExtrasError] = useState<string | null>(null);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isSyncHelpOpen, setIsSyncHelpOpen] = useState(false);
  const [setupKind, setSetupKind] = useState<AnkiDeckKind | null>(null);
  const [syncKind, setSyncKind] = useState<AnkiDeckKind | null>(null);
  const [isDeletingKnowledgeBase, setIsDeletingKnowledgeBase] = useState(false);
  const [isDeleteKnowledgeBaseConfirmOpen, setIsDeleteKnowledgeBaseConfirmOpen] =
    useState(false);

  const loadTokenUsage = useCallback(async () => {
    setExtrasError(null);

    try {
      const usage = await fetchTokenUsage();
      setTokenUsage(usage);
    } catch (loadError) {
      setExtrasError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load preferences.",
      );
    } finally {
      setIsTokenUsageLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTokenUsage();
  }, [loadTokenUsage]);

  const hasSyncedData = lastSyncedAt !== null;
  const isLoading =
    (!hasSyncedData &&
      (syncStatus === "idle" || syncStatus === "loading")) ||
    isTokenUsageLoading;
  const error = extrasError ?? (!hasSyncedData ? syncError : null);

  async function refreshAnkiStatus() {
    try {
      const anki = await fetchAnkiStatus();
      dispatch(setAnkiStatus(anki));
    } catch (refreshError) {
      setExtrasError(
        refreshError instanceof Error
          ? refreshError.message
          : "Failed to refresh Anki status.",
      );
    }
  }

  async function handleDeckConfigured() {
    setSetupKind(null);
    await refreshAnkiStatus();
  }

  async function handleSyncCompleted(direction: AnkiSyncDirection) {
    setSyncKind(null);
    if (direction === "pull") {
      // Pull mutates characters/words in Postgres — refresh Redux cache.
      await dispatch(syncAppData()).unwrap();
      return;
    }
    await refreshAnkiStatus();
  }

  async function handleConfirmDeleteKnowledgeBase() {
    setIsDeleteKnowledgeBaseConfirmOpen(false);
    setIsDeletingKnowledgeBase(true);
    try {
      await deleteKnowledgeBase();
      dispatch(resetKnowledgeBaseData());
    } catch (deleteError) {
      setExtrasError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete knowledge base.",
      );
    } finally {
      setIsDeletingKnowledgeBase(false);
    }
  }

  const maxDailyTokens = Math.max(
    1,
    ...(tokenUsage?.days.map((day) => day.tokens) ?? [0]),
  );

  const remainingTokens =
    tokenUsage !== null && tokenUsage.max_allowed_token !== null
      ? clampToken(tokenUsage.available_token, tokenUsage.max_allowed_token)
      : null;
  const remainingPercent =
    tokenUsage !== null &&
    tokenUsage.max_allowed_token !== null &&
    remainingTokens !== null
      ? (remainingTokens / tokenUsage.max_allowed_token) * 100
      : 0;

  const deckRows = ANKI_DECK_ORDER.map((kind) => ({
    kind,
    label: ANKI_DECK_LABELS[kind],
  }));
  const hasUnsynchronizedDeck = deckRows.some(
    ({ kind }) => ankiStatus.decks[kind].status === "not_synchronized",
  );

  return (
    <Page title="Preferences">
      {isLoading && <p>Loading preferences...</p>}
      {error && <p className="table-error">{error}</p>}

      {!isLoading && (
        <section className="preferences-section preferences-section--anki">
          <h2 className="preferences-section-title">Anki synchronization</h2>
          <p className="preferences-section-description">
            Map your knowledge-base characters and words to Anki decks through
            AnkiConnect.
          </p>

          {!ankiStatus.connected && (
            <div className="anki-warning" role="status">
              <div className="anki-warning-title-row">
                <p className="anki-warning-text">
                  Start the Anki app with the AnkiConnect add-on activated before
                  configuring decks.
                </p>
                <button
                  type="button"
                  className="home-hsk-info-button"
                  aria-label="How to set up AnkiConnect"
                  title="How to set up AnkiConnect"
                  onClick={() => setIsGuideOpen(true)}
                >
                  <InfoIcon className="home-hsk-info-icon" />
                </button>
              </div>
            </div>
          )}

          {hasUnsynchronizedDeck && (
            <div className="anki-warning" role="status">
              <div className="anki-warning-title-row">
                <p className="anki-warning-text">
                  Struggling with your Anki setup? Click here for more info
                </p>
                <button
                  type="button"
                  className="home-hsk-info-button"
                  aria-label="Anki synchronization help"
                  title="Anki synchronization help"
                  onClick={() => setIsSyncHelpOpen(true)}
                >
                  <InfoIcon className="home-hsk-info-icon" />
                </button>
              </div>
            </div>
          )}

          <ul className="anki-deck-list">
            {deckRows.map(({ kind, label }) => {
              const mapping = ankiStatus.decks[kind];
              return (
                <li key={kind} className="anki-deck-row">
                  <div className="anki-deck-row-main">
                    <span className="anki-deck-name">{label}</span>
                    <span
                      className={`anki-deck-status anki-deck-status--${mapping.status}`}
                    >
                      {formatDeckStatus(mapping.status)}
                    </span>
                    {mapping.deck_name !== "" && (
                      <span className="anki-deck-mapped-name">
                        {mapping.deck_name}
                      </span>
                    )}
                  </div>
                  <div className="anki-deck-row-actions">
                    {mapping.status !== "not_configured" && (
                      <button
                        type="button"
                        className="page-add-button anki-deck-action-button"
                        disabled={!ankiStatus.connected}
                        onClick={() => setSyncKind(kind)}
                      >
                        <SyncIcon className="anki-deck-action-icon" />
                        Sync
                      </button>
                    )}
                    <button
                      type="button"
                      className="page-add-button anki-deck-action-button"
                      disabled={!ankiStatus.connected}
                      onClick={() => setSetupKind(kind)}
                    >
                      <SettingsIcon className="anki-deck-action-icon" />
                      Setup
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

{!isLoading && tokenUsage && (
        <section className="preferences-section preferences-section--usage">
          <h2 className="preferences-section-title">Token usage</h2>
          <p className="preferences-section-description">
            Tokens consumed by chat and grammar-check LLM calls.
          </p>

          <p className="preferences-token-total">
            <span className="preferences-token-total-label">Total tokens used</span>
            <span className="preferences-token-total-value">
              {formatTokenCount(tokenUsage.total_tokens)}
            </span>
          </p>

          {tokenUsage.max_allowed_token !== null && remainingTokens !== null && (
            <div
              className="preferences-token-remaining"
              aria-label="Remaining tokens"
            >
              <div className="preferences-token-remaining-header">
                <span className="preferences-token-remaining-label">
                  Remaining tokens
                </span>
                <span className="preferences-token-remaining-value">
                  {formatTokenCount(remainingTokens)} /{" "}
                  {formatTokenCount(tokenUsage.max_allowed_token)}
                </span>
              </div>
              <div
                className="preferences-token-remaining-track"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={tokenUsage.max_allowed_token}
                aria-valuenow={remainingTokens}
                aria-label="Remaining free-plan tokens"
              >
                <div
                  className="preferences-token-remaining-fill"
                  style={{ width: `${remainingPercent}%` }}
                />
              </div>
            </div>
          )}

          <div
            className="preferences-token-chart"
            role="img"
            aria-label="Token usage for the last 7 days"
          >
            {tokenUsage.days.map((day) => {
              const heightPercent = (day.tokens / maxDailyTokens) * 100;
              return (
                <div key={day.date} className="preferences-token-chart-bar">
                  <div className="preferences-token-chart-value">
                    {formatTokenCount(day.tokens)}
                  </div>
                  <div className="preferences-token-chart-track">
                    <div
                      className="preferences-token-chart-fill"
                      style={{ height: `${heightPercent}%` }}
                      title={`${formatDayLabel(day.date)}: ${formatTokenCount(day.tokens)} tokens`}
                    />
                  </div>
                  <div className="preferences-token-chart-label">
                    {formatDayLabel(day.date)}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {!isLoading && (
        <section className="preferences-section preferences-section--danger">
          <h2 className="preferences-section-title">Dangerous actions</h2>
          <p className="preferences-section-description">
            These actions are irreversible. Export your knowledge base first if
            you may need it later.
          </p>
          <button
            type="button"
            className="page-mode-button--danger"
            onClick={() => setIsDeleteKnowledgeBaseConfirmOpen(true)}
            disabled={isDeletingKnowledgeBase}
          >
            <TrashIcon className="chat-modal-clear-icon" />
            Delete knowledge base
          </button>
        </section>
      )}

      <ConfirmModal
        isOpen={isDeleteKnowledgeBaseConfirmOpen}
        message="Are you sure you want to delete the knowledge base? Please make sure you have exported the database before deleting it."
        danger={true}
        onCancel={() => setIsDeleteKnowledgeBaseConfirmOpen(false)}
        onConfirm={() => void handleConfirmDeleteKnowledgeBase()}
      />
      <AnkiConnectGuideModal
        isOpen={isGuideOpen}
        onClose={() => {
          setIsGuideOpen(false);
          void refreshAnkiStatus().catch(() => {
            /* keep previous status if refresh fails */
          });
        }}
      />
      <AnkiDeckSetupModal
        isOpen={setupKind !== null}
        kind={setupKind}
        initialMapping={setupKind ? ankiStatus.decks[setupKind] : null}
        onCancel={() => setSetupKind(null)}
        onConfigured={() => void handleDeckConfigured()}
      />
      <AnkiSyncModal
        isOpen={syncKind !== null}
        kind={syncKind}
        onCancel={() => setSyncKind(null)}
        onSynced={(direction) => void handleSyncCompleted(direction)}
      />
      <AnkiSyncHelpModal
        isOpen={isSyncHelpOpen}
        onClose={() => setIsSyncHelpOpen(false)}
      />
    </Page>
  );
}
