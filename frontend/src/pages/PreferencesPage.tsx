import { useCallback, useEffect, useState } from "react";
import AnkiConnectGuideModal from "../components/AnkiConnectGuideModal";
import AnkiDeckSetupModal from "../components/AnkiDeckSetupModal";
import AnkiSyncHelpModal from "../components/AnkiSyncHelpModal";
import AnkiSyncModal from "../components/AnkiSyncModal";
import Banner from "../components/Banner";
import ChangePlanModal from "../components/ChangePlanModal";
import ConfirmModal from "../components/ConfirmModal";
import { SettingsIcon, SyncIcon, TrashIcon } from "../components/icons";
import Page from "../components/Page";
import UpdatePlanModal from "../components/UpdatePlanModal";
import WarningModal from "../components/WarningModal";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { setAnkiStatus } from "../store/slices/ankiSlice";
import { resetKnowledgeBaseData, syncAppData } from "../store/thunks/syncAppData";
import {
  ANKI_DECK_LABELS,
  ANKI_DECK_ORDER,
  type AnkiDeckKind,
  type AnkiDeckStatus,
  type AnkiSyncDirection,
  type AnkiSyncResult,
} from "../types/anki";
import type { UserPlan } from "../types/adminUser";
import type { TokenUsageSummary } from "../types/tokenUsage";
import { fetchAnkiStatus } from "../utils/anki/ankiApi";
import { fetchTokenUsage } from "../utils/aiChat/tokenUsageApi";
import {
  fetchSmartAiPreference,
  updateSmartAiPreference,
} from "../utils/aiChat/smartAiApi";
import { deleteKnowledgeBase } from "../utils/knowledgeBase/knowledgeBaseApi";
import chatModalStyles from "../components/ChatModal.module.css";
import styles from "./PreferencesPage.module.css";

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
const MAX_SHOWN_FAILED_CARDS = 10;

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
  const [isSmartAiEnabled, setIsSmartAiEnabled] = useState(true);
  const [isSmartAiLoading, setIsSmartAiLoading] = useState(true);
  const [isSmartAiSaving, setIsSmartAiSaving] = useState(false);
  const [extrasError, setExtrasError] = useState<string | null>(null);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isSyncHelpOpen, setIsSyncHelpOpen] = useState(false);
  const [setupKind, setSetupKind] = useState<AnkiDeckKind | null>(null);
  const [syncKind, setSyncKind] = useState<AnkiDeckKind | null>(null);
  const [isDeletingKnowledgeBase, setIsDeletingKnowledgeBase] = useState(false);
  const [isDeleteKnowledgeBaseConfirmOpen, setIsDeleteKnowledgeBaseConfirmOpen] =
    useState(false);
  const [isUpdatePlanModalOpen, setIsUpdatePlanModalOpen] = useState(false);
  const [isChangePlanModalOpen, setIsChangePlanModalOpen] = useState(false);
  const [syncWarningMessage, setSyncWarningMessage] = useState<string | null>(
    null,
  );

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

  const loadSmartAiPreference = useCallback(async () => {
    try {
      const preference = await fetchSmartAiPreference();
      setIsSmartAiEnabled(preference.enabled);
    } catch (loadError) {
      setExtrasError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load the Smart AI preference.",
      );
    } finally {
      setIsSmartAiLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTokenUsage();
  }, [loadTokenUsage]);

  useEffect(() => {
    void loadSmartAiPreference();
  }, [loadSmartAiPreference]);

  async function handleToggleSmartAi(nextEnabled: boolean) {
    const previousEnabled = isSmartAiEnabled;
    setIsSmartAiEnabled(nextEnabled);
    setIsSmartAiSaving(true);
    try {
      await updateSmartAiPreference(nextEnabled);
    } catch (toggleError) {
      setIsSmartAiEnabled(previousEnabled);
      setExtrasError(
        toggleError instanceof Error
          ? toggleError.message
          : "Failed to update the Smart AI preference.",
      );
    } finally {
      setIsSmartAiSaving(false);
    }
  }

  useEffect(() => {
    void refreshAnkiStatus();
  }, []);

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

  async function handleSyncCompleted(
    direction: AnkiSyncDirection,
    result: AnkiSyncResult,
  ) {
    setSyncKind(null);
    const failedCards = Array.isArray(result.failed) ? result.failed : [];
    if (failedCards.length > 0) {
      const shown = failedCards.slice(0, MAX_SHOWN_FAILED_CARDS);
      const remaining = failedCards.length - shown.length;
      setSyncWarningMessage(
        `These cards couldn't be synchronized: ${shown.join("、")}` +
          (remaining > 0 ? `, and ${remaining} other cards.` : "."),
      );
    }
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

  const currentPlan: UserPlan = tokenUsage?.plan === "pro" ? "pro" : "free";

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

      {!isLoading && tokenUsage && (
        <section className={`preferences-section ${styles.preferencesSectionPlan}`}>
          <h2 className={styles.preferencesSectionTitle}>Current plan</h2>
          <p className={styles.preferencesSectionDescription}>
            <span>
              You&apos;re on the{" "}
              <b>{currentPlan === "pro" ? "Pro" : "Free"}</b> plan.
            </span>
            <button
              type="button"
              className="page-add-button"
              onClick={() => setIsChangePlanModalOpen(true)}
            >
              Compare plans
            </button>
          </p>
        </section>
      )}

      {!isLoading && (
        <section className={`preferences-section ${styles.preferencesSectionAnki}`}>
          <h2 className={styles.preferencesSectionTitle}>Anki synchronization</h2>
          <p className={styles.preferencesSectionDescription}>
            Map your knowledge-base characters and words to Anki decks through
            AnkiConnect.
          </p>
          {!ankiStatus.connected && (
            <Banner
              type="warning"
              message="Start the Anki app with the AnkiConnect add-on activated before configuring decks."
              buttonMessage="How to set up AnkiConnect"
              actionOnButtonClick={() => setIsGuideOpen(true)}
            />
          )}

          {hasUnsynchronizedDeck && (
            <Banner
              type="warning"
              message="Struggling with your Anki setup? Click here for more info"
              buttonMessage="Anki synchronization help"
              actionOnButtonClick={() => setIsSyncHelpOpen(true)}
            />
          )}

          <ul className={styles.ankiDeckList}>
            {deckRows.map(({ kind, label }) => {
              const mapping = ankiStatus.decks[kind];
              const statusClass = ankiStatus.connected
                ? mapping.status
                : "not_synchronized";
              return (
                <li key={kind} className={styles.ankiDeckRow}>
                  <div className={styles.ankiDeckRowMain}>
                    <span className={styles.ankiDeckName}>{label}</span>
                    <span
                      className={`${styles.ankiDeckStatus} ${styles[`anki-deck-status--${statusClass}`]}`}
                    >
                      {ankiStatus.connected
                        ? formatDeckStatus(mapping.status)
                        : "Not connected"}
                    </span>
                    {mapping.deck_name !== "" && (
                      <span className={styles.ankiDeckMappedName}>
                        {mapping.deck_name}
                      </span>
                    )}
                  </div>
                  <div className={styles.ankiDeckRowActions}>
                    {mapping.status !== "not_configured" && (
                      <button
                        type="button"
                        className={`page-add-button ${styles.ankiDeckActionButton}`}
                        disabled={!ankiStatus.connected}
                        onClick={() => setSyncKind(kind)}
                      >
                        <SyncIcon className={styles.ankiDeckActionIcon} />
                        Sync
                      </button>
                    )}
                    <button
                      type="button"
                      className={`page-add-button ${styles.ankiDeckActionButton}`}
                      disabled={!ankiStatus.connected}
                      onClick={() => setSetupKind(kind)}
                    >
                      <SettingsIcon className={styles.ankiDeckActionIcon} />
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
        <section className={`preferences-section ${styles.preferencesSectionUsage}`}>
          <h2 className={styles.preferencesSectionTitle}>AI usage</h2>
          <p className={styles.preferencesSectionDescription}>
            How much of your monthly AI allowance chat and grammar-check calls
            have used.
          </p>

          {!isSmartAiLoading && (
            <div className={styles.preferencesToggleRow}>
              <span className={styles.preferencesToggleRowLabel}>
                <span className={styles.preferencesToggleRowTitle}>Smart AI</span>
                <p className={styles.preferencesToggleRowDescription}>
                  Smarter answers, at the cost of a bit more time and usage.
                </p>
              </span>
              <label className={styles.preferencesToggle} aria-label="Smart AI">
                <input
                  type="checkbox"
                  checked={isSmartAiEnabled}
                  disabled={isSmartAiSaving}
                  onChange={(event) =>
                    void handleToggleSmartAi(event.target.checked)
                  }
                />
                <span className={styles.preferencesToggleTrack} />
                <span className={styles.preferencesToggleThumb} />
              </label>
            </div>
          )}

          <div className={styles.preferencesUsageProgress}>
            <div className={styles.preferencesUsageProgressHeader}>
              <span className={styles.preferencesUsageProgressLabel}>
                Used this month
              </span>
              <span className={styles.preferencesUsageProgressValue}>
                {formatPercent(usedPercent)}
              </span>
            </div>
            <div
              className={styles.preferencesUsageProgressTrack}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(usedPercent)}
              aria-label="Percentage of monthly AI usage allowance used"
            >
              <div
                className={styles.preferencesUsageProgressFill}
                style={{ width: `${usedPercent}%` }}
              />
            </div>
            <p className={styles.preferencesUsageResetNote}>
              Resets to 0% on the 1st of next month.
            </p>
          </div>

          {isUsageExhausted && (
            <Banner
              type="warning"
              message="You're running out of AI usage for the month. Need more? Don't hesitate to change your plan!"
              buttonMessage="Update plan"
              actionOnButtonClick={() => setIsUpdatePlanModalOpen(true)}
            />
          )}

          <div
            className={styles.preferencesUsageChart}
            role="img"
            aria-label={`Cumulative AI usage this month, currently at ${formatPercent(usedPercent)} of the monthly allowance`}
          >
            <svg
              viewBox={`0 0 ${USAGE_CHART_WIDTH} ${USAGE_CHART_HEIGHT}`}
              className={styles.preferencesUsageChartSvg}
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
                    className={styles.preferencesUsageChartGrid}
                  />
                );
              })}
              {usageAreaPath && (
                <path d={usageAreaPath} className={styles.preferencesUsageChartArea} />
              )}
              {usageLinePath && (
                <path d={usageLinePath} className={styles.preferencesUsageChartLine} />
              )}
              {usageChartPoints.map((point) => (
                <circle
                  key={point.date}
                  cx={point.x}
                  cy={point.y}
                  r={2.5}
                  className={styles.preferencesUsageChartDot}
                >
                  <title>{`${formatDayLabel(point.date)}: ${formatPercent(point.percent)} used`}</title>
                </circle>
              ))}
              {currentUsagePoint && (
                <text
                  x={currentUsagePoint.x}
                  y={Math.max(12, currentUsagePoint.y - 8)}
                  textAnchor="end"
                  className={styles.preferencesUsageChartCurrentLabel}
                >
                  {formatPercent(usedPercent)}
                </text>
              )}
            </svg>
            <div className={styles.preferencesUsageChartLabels}>
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
        <section className={`preferences-section ${styles.preferencesSectionDanger}`}>
          <h2 className={styles.preferencesSectionTitle}>Dangerous actions</h2>
          <p className={styles.preferencesSectionDescription}>
            These actions are irreversible. Export your knowledge base first if
            you may need it later.
          </p>
          <button
            type="button"
            className="page-mode-button--danger"
            onClick={() => setIsDeleteKnowledgeBaseConfirmOpen(true)}
            disabled={isDeletingKnowledgeBase}
          >
            <TrashIcon className={chatModalStyles.chatModalClearIcon} />
            Delete knowledge base
          </button>
        </section>
      )}

      <WarningModal
        isOpen={syncWarningMessage !== null}
        message={syncWarningMessage ?? ""}
        onClose={() => setSyncWarningMessage(null)}
      />
      <ConfirmModal
        isOpen={isDeleteKnowledgeBaseConfirmOpen}
        message="Are you sure you want to delete the knowledge base? Please make sure you have exported the database before deleting it. (note: this won't delete your Anki decks)"
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
        onSynced={(direction, result) =>
          void handleSyncCompleted(direction, result)
        }
      />
      <AnkiSyncHelpModal
        isOpen={isSyncHelpOpen}
        onClose={() => setIsSyncHelpOpen(false)}
      />
      <ChangePlanModal
        isOpen={isChangePlanModalOpen}
        currentPlan={currentPlan}
        onClose={() => setIsChangePlanModalOpen(false)}
        onSwitchPlan={() => {
          setIsChangePlanModalOpen(false);
          setIsUpdatePlanModalOpen(true);
        }}
      />
      <UpdatePlanModal
        isOpen={isUpdatePlanModalOpen}
        onClose={() => setIsUpdatePlanModalOpen(false)}
      />
    </Page>
  );
}
