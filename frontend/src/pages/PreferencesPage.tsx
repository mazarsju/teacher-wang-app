import { useCallback, useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import AnkiConnectGuideModal from "../components/AnkiConnectGuideModal";
import AnkiDeckSetupModal from "../components/AnkiDeckSetupModal";
import AnkiSyncHelpModal from "../components/AnkiSyncHelpModal";
import AnkiSyncModal from "../components/AnkiSyncModal";
import Banner from "../components/Banner";
import Button from "../components/Button";
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

function formatDeckStatus(
  status: AnkiDeckStatus,
  t: TFunction<"preferences">,
): string {
  switch (status) {
    case "not_configured":
      return t("preferencesPage.anki.deckStatus.notConfigured");
    case "synchronized":
      return t("preferencesPage.anki.deckStatus.synchronized");
    case "not_synchronized":
      return t("preferencesPage.anki.deckStatus.notSynchronized");
  }
}

export default function PreferencesPage() {
  const { t } = useTranslation("preferences");
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
          : t("preferencesPage.errors.loadPreferences"),
      );
    } finally {
      setIsTokenUsageLoading(false);
    }
  }, [t]);

  const loadSmartAiPreference = useCallback(async () => {
    try {
      const preference = await fetchSmartAiPreference();
      setIsSmartAiEnabled(preference.enabled);
    } catch (loadError) {
      setExtrasError(
        loadError instanceof Error
          ? loadError.message
          : t("preferencesPage.errors.loadSmartAi"),
      );
    } finally {
      setIsSmartAiLoading(false);
    }
  }, [t]);

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
          : t("preferencesPage.errors.updateSmartAi"),
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
          : t("preferencesPage.errors.refreshAnkiStatus"),
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
        t("preferencesPage.errors.syncFailedMessage", {
          cards: shown.join("、"),
        }) +
          (remaining > 0
            ? t("preferencesPage.errors.syncFailedRemaining", {
                count: remaining,
              })
            : t("preferencesPage.errors.syncFailedEnd")),
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
          : t("preferencesPage.errors.deleteKnowledgeBase"),
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
    label: t(`ankiDeckKind.labels.${kind}`),
  }));
  const hasUnsynchronizedDeck = deckRows.some(
    ({ kind }) => ankiStatus.decks[kind].status === "not_synchronized",
  );

  return (
    <Page title={t("preferencesPage.title")}>
      {isLoading && <p>{t("preferencesPage.loading")}</p>}
      {error && <p className="table-error">{error}</p>}

      {!isLoading && tokenUsage && (
        <section className={`preferences-section ${styles.preferencesSectionPlan}`}>
          <h2 className={styles.preferencesSectionTitle}>
            {t("preferencesPage.currentPlan.title")}
          </h2>
          <p className={styles.preferencesSectionDescription}>
            <span>
              <Trans
                i18nKey={
                  currentPlan === "pro"
                    ? "preferencesPage.currentPlan.descriptionPro"
                    : "preferencesPage.currentPlan.descriptionFree"
                }
                t={t}
                components={{ 1: <b /> }}
              />
            </span>
            <Button
              kind="confirm"
              variant="page"
              text={t("preferencesPage.currentPlan.comparePlans")}
              onClick={() => setIsChangePlanModalOpen(true)}
            />
          </p>
        </section>
      )}

      {!isLoading && (
        <section className={`preferences-section ${styles.preferencesSectionAnki}`}>
          <h2 className={styles.preferencesSectionTitle}>
            {t("preferencesPage.anki.title")}
          </h2>

          <p className={styles.ankiMobileWarning}>
            {t("preferencesPage.anki.mobileWarning")}
          </p>

          <div className={styles.ankiDesktopContent}>
            <p className={styles.preferencesSectionDescription}>
              {t("preferencesPage.anki.description")}
            </p>
            {!ankiStatus.connected && (
              <Banner
                type="warning"
                message={t("preferencesPage.anki.notConnectedBanner.message")}
                buttonMessage={t(
                  "preferencesPage.anki.notConnectedBanner.buttonMessage",
                )}
                actionOnButtonClick={() => setIsGuideOpen(true)}
              />
            )}

            {hasUnsynchronizedDeck && (
              <Banner
                type="warning"
                message={t("preferencesPage.anki.syncHelpBanner.message")}
                buttonMessage={t(
                  "preferencesPage.anki.syncHelpBanner.buttonMessage",
                )}
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
                          ? formatDeckStatus(mapping.status, t)
                          : t("preferencesPage.anki.deckStatus.notConnected")}
                      </span>
                      {mapping.deck_name !== "" && (
                        <span className={styles.ankiDeckMappedName}>
                          {mapping.deck_name}
                        </span>
                      )}
                    </div>
                    <div className={styles.ankiDeckRowActions}>
                      {mapping.status !== "not_configured" && (
                        <Button
                          kind="confirm"
                          variant="page"
                          text={t("preferencesPage.anki.syncButton")}
                          icon={<SyncIcon />}
                          disabled={!ankiStatus.connected}
                          onClick={() => setSyncKind(kind)}
                        />
                      )}
                      <Button
                        kind="confirm"
                        variant="page"
                        text={t("preferencesPage.anki.setupButton")}
                        icon={<SettingsIcon />}
                        disabled={!ankiStatus.connected}
                        onClick={() => setSetupKind(kind)}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

{!isLoading && tokenUsage && (
        <section className={`preferences-section ${styles.preferencesSectionUsage}`}>
          <h2 className={styles.preferencesSectionTitle}>
            {t("preferencesPage.usage.title")}
          </h2>
          <p className={styles.preferencesSectionDescription}>
            {t("preferencesPage.usage.description")}
          </p>

          {!isSmartAiLoading && (
            <div className={styles.preferencesToggleRow}>
              <span className={styles.preferencesToggleRowLabel}>
                <span className={styles.preferencesToggleRowTitle}>
                  {t("preferencesPage.usage.smartAi.title")}
                </span>
                <p className={styles.preferencesToggleRowDescription}>
                  {t("preferencesPage.usage.smartAi.description")}
                </p>
              </span>
              <label
                className={styles.preferencesToggle}
                aria-label={t("preferencesPage.usage.smartAi.ariaLabel")}
              >
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
                {t("preferencesPage.usage.usedThisMonth")}
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
              aria-label={t("preferencesPage.usage.progressBarAriaLabel")}
            >
              <div
                className={styles.preferencesUsageProgressFill}
                style={{ width: `${usedPercent}%` }}
              />
            </div>
            <p className={styles.preferencesUsageResetNote}>
              {t("preferencesPage.usage.resetNote")}
            </p>
          </div>

          {isUsageExhausted && (
            <Banner
              type="warning"
              message={t("preferencesPage.usage.exhaustedBanner.message")}
              buttonMessage={t("preferencesPage.usage.exhaustedBanner.buttonMessage")}
              actionOnButtonClick={() => setIsUpdatePlanModalOpen(true)}
            />
          )}

          <div
            className={styles.preferencesUsageChart}
            role="img"
            aria-label={t("preferencesPage.usage.chartAriaLabel", {
              percent: formatPercent(usedPercent),
            })}
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
                  <title>
                    {t("preferencesPage.usage.chartDotTitle", {
                      day: formatDayLabel(point.date),
                      percent: formatPercent(point.percent),
                    })}
                  </title>
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
          <h2 className={styles.preferencesSectionTitle}>
            {t("preferencesPage.danger.title")}
          </h2>
          <p className={styles.preferencesSectionDescription}>
            {t("preferencesPage.danger.description")}
          </p>
          <Button
            kind="danger"
            variant="page"
            text={t("preferencesPage.danger.deleteButton")}
            icon={<TrashIcon />}
            onClick={() => setIsDeleteKnowledgeBaseConfirmOpen(true)}
            disabled={isDeletingKnowledgeBase}
          />
        </section>
      )}

      <WarningModal
        isOpen={syncWarningMessage !== null}
        message={syncWarningMessage ?? ""}
        onClose={() => setSyncWarningMessage(null)}
      />
      <ConfirmModal
        isOpen={isDeleteKnowledgeBaseConfirmOpen}
        message={t("preferencesPage.danger.deleteConfirmMessage")}
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
