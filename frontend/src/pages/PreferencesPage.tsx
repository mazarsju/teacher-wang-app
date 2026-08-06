import { useCallback, useEffect, useState } from "react";
import AnkiConnectGuideModal from "../components/AnkiConnectGuideModal";
import AnkiDeckSetupModal from "../components/AnkiDeckSetupModal";
import AnkiSyncHelpModal from "../components/AnkiSyncHelpModal";
import AnkiSyncModal from "../components/AnkiSyncModal";
import ConfirmModal from "../components/ConfirmModal";
import { InfoIcon, SettingsIcon, SyncIcon, TrashIcon } from "../components/icons";
import Page from "../components/Page";
import UpdatePlanModal from "../components/UpdatePlanModal";
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

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

const USAGE_CHART_WIDTH = 600;
const USAGE_CHART_HEIGHT = 160;

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
  const [isUpdatePlanModalOpen, setIsUpdatePlanModalOpen] = useState(false);

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

  let cumulativeTokens = 0;
  const usageChartPoints = (tokenUsage?.days ?? []).map((day, index, days) => {
    cumulativeTokens += day.tokens;
    const percent =
      tokenUsage !== null && tokenUsage.max_allowed_token > 0
        ? clampPercent((cumulativeTokens / tokenUsage.max_allowed_token) * 100)
        : 0;
    const x =
      days.length > 1
        ? (index / (days.length - 1)) * USAGE_CHART_WIDTH
        : USAGE_CHART_WIDTH / 2;
    const y = USAGE_CHART_HEIGHT - (percent / 100) * USAGE_CHART_HEIGHT;
    return { date: day.date, percent, x, y };
  });

  const usedPercent =
    usageChartPoints.length > 0
      ? usageChartPoints[usageChartPoints.length - 1].percent
      : 0;

  const usageLinePath = usageChartPoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const usageAreaPath =
    usageChartPoints.length > 0
      ? `${usageLinePath} L ${usageChartPoints[usageChartPoints.length - 1].x} ${USAGE_CHART_HEIGHT} L ${usageChartPoints[0].x} ${USAGE_CHART_HEIGHT} Z`
      : "";
  const currentUsagePoint = usageChartPoints[usageChartPoints.length - 1];
  const isUsageExhausted = usedPercent >= 100;

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
          <h2 className="preferences-section-title">AI usage</h2>
          <p className="preferences-section-description">
            How much of your monthly AI allowance chat and grammar-check calls
            have used.
          </p>

          <div className="preferences-usage-progress">
            <div className="preferences-usage-progress-header">
              <span className="preferences-usage-progress-label">
                Used this month
              </span>
              <span className="preferences-usage-progress-value">
                {formatPercent(usedPercent)}
              </span>
            </div>
            <div
              className="preferences-usage-progress-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(usedPercent)}
              aria-label="Percentage of monthly AI usage allowance used"
            >
              <div
                className="preferences-usage-progress-fill"
                style={{ width: `${usedPercent}%` }}
              />
            </div>
            <p className="preferences-usage-reset-note">
              Resets to 0% on the 1st of next month.
            </p>
          </div>

          {isUsageExhausted && (
            <div className="anki-warning" role="status">
              <div className="anki-warning-title-row">
                <p className="anki-warning-text">
                  You&apos;re running out of AI usage for the month. Need
                  more? Don&apos;t hesitate to change your plan!
                </p>
                <button
                  type="button"
                  className="page-add-button"
                  onClick={() => setIsUpdatePlanModalOpen(true)}
                >
                  Update plan
                </button>
              </div>
            </div>
          )}

          <div
            className="preferences-usage-chart"
            role="img"
            aria-label={`Cumulative AI usage this month, currently at ${formatPercent(usedPercent)} of the monthly allowance`}
          >
            <svg
              viewBox={`0 0 ${USAGE_CHART_WIDTH} ${USAGE_CHART_HEIGHT}`}
              className="preferences-usage-chart-svg"
            >
              <defs>
                <linearGradient
                  id="preferences-usage-area-fill"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#60a5fa" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[0, 25, 50, 75, 100].map((tick) => {
                const y = USAGE_CHART_HEIGHT - (tick / 100) * USAGE_CHART_HEIGHT;
                return (
                  <line
                    key={tick}
                    x1={0}
                    x2={USAGE_CHART_WIDTH}
                    y1={y}
                    y2={y}
                    className="preferences-usage-chart-grid"
                  />
                );
              })}
              {usageAreaPath && (
                <path d={usageAreaPath} className="preferences-usage-chart-area" />
              )}
              {usageLinePath && (
                <path d={usageLinePath} className="preferences-usage-chart-line" />
              )}
              {usageChartPoints.map((point) => (
                <circle
                  key={point.date}
                  cx={point.x}
                  cy={point.y}
                  r={2.5}
                  className="preferences-usage-chart-dot"
                >
                  <title>{`${formatDayLabel(point.date)}: ${formatPercent(point.percent)} used`}</title>
                </circle>
              ))}
              {currentUsagePoint && (
                <text
                  x={currentUsagePoint.x}
                  y={Math.max(12, currentUsagePoint.y - 8)}
                  textAnchor="end"
                  className="preferences-usage-chart-current-label"
                >
                  {formatPercent(usedPercent)}
                </text>
              )}
            </svg>
            <div className="preferences-usage-chart-labels">
              <span>
                {tokenUsage.days[0]
                  ? formatDayLabel(tokenUsage.days[0].date)
                  : ""}
              </span>
              <span>
                {tokenUsage.days[tokenUsage.days.length - 1]
                  ? formatDayLabel(tokenUsage.days[tokenUsage.days.length - 1].date)
                  : ""}
              </span>
            </div>
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
      <UpdatePlanModal
        isOpen={isUpdatePlanModalOpen}
        onClose={() => setIsUpdatePlanModalOpen(false)}
      />
    </Page>
  );
}
