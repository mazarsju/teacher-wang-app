import { useCallback, useEffect, useState, type FormEvent } from "react";
import AnkiConnectGuideModal from "../components/AnkiConnectGuideModal";
import AnkiDeckSetupModal from "../components/AnkiDeckSetupModal";
import AnkiSyncModal from "../components/AnkiSyncModal";
import { InfoIcon, SettingsIcon, SyncIcon } from "../components/icons";
import Page from "../components/Page";
import {
  ANKI_DECK_LABELS,
  ANKI_DECK_ORDER,
  type AnkiDeckKind,
  type AnkiDeckStatus,
  type AnkiStatus,
} from "../types/anki";
import type { LlmConfig } from "../types/llmConfig";
import type { TokenUsageSummary } from "../types/tokenUsage";
import { fetchAnkiStatus } from "../utils/anki/ankiApi";
import { fetchLlmConfig, saveLlmConfig } from "../utils/aiChat/llmConfigApi";
import { fetchTokenUsage } from "../utils/aiChat/tokenUsageApi";

const emptyLlmConfig: LlmConfig = {
  LLM_API_KEY: "",
  LLM_MODEL: "",
};

const emptyAnkiStatus: AnkiStatus = {
  connected: false,
  synchronization_status: "not_synchronized",
  pending_push_estimate: 0,
  decks: {
    mandarin_vocabulary: {
      status: "not_configured",
      deck_name: "",
      model_name: "",
      fields: {},
    },
    mandarin_writting: {
      status: "not_configured",
      deck_name: "",
      model_name: "",
      fields: {},
    },
  },
};

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

function formatCostUsd(value: number): string {
  return Number(value).toPrecision(3);
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
  const [llmConfig, setLlmConfig] = useState<LlmConfig>(emptyLlmConfig);
  const [tokenUsage, setTokenUsage] = useState<TokenUsageSummary | null>(null);
  const [ankiStatus, setAnkiStatus] = useState<AnkiStatus>(emptyAnkiStatus);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [setupKind, setSetupKind] = useState<AnkiDeckKind | null>(null);
  const [syncKind, setSyncKind] = useState<AnkiDeckKind | null>(null);

  const loadPreferences = useCallback(async () => {
    setError(null);

    try {
      const [config, usage, anki] = await Promise.all([
        fetchLlmConfig(),
        fetchTokenUsage(),
        fetchAnkiStatus(),
      ]);
      setLlmConfig(config);
      setTokenUsage(usage);
      setAnkiStatus(anki);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load preferences.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPreferences();
  }, [loadPreferences]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setSaveMessage(null);

    try {
      const savedConfig = await saveLlmConfig(llmConfig);
      setLlmConfig(savedConfig);
      setSaveMessage("LLM configuration saved.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save LLM configuration.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeckConfigured() {
    setSetupKind(null);
    try {
      const anki = await fetchAnkiStatus();
      setAnkiStatus(anki);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Failed to refresh Anki status.",
      );
    }
  }

  async function handleSyncCompleted() {
    setSyncKind(null);
    try {
      const anki = await fetchAnkiStatus();
      setAnkiStatus(anki);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Failed to refresh Anki status.",
      );
    }
  }

  const maxDailyTokens = Math.max(
    1,
    ...(tokenUsage?.days.map((day) => day.tokens) ?? [0]),
  );

  const deckRows = ANKI_DECK_ORDER.map((kind) => ({
    kind,
    label: ANKI_DECK_LABELS[kind],
  }));

  return (
    <Page title="Preferences">
      <section className="preferences-section">
        <h2 className="preferences-section-title">LLM configuration</h2>
        <p className="preferences-section-description">
          Configure the API key and model used by the chat features.
        </p>

        {isLoading && <p>Loading preferences...</p>}
        {error && <p className="table-error">{error}</p>}
        {saveMessage && <p className="preferences-save-message">{saveMessage}</p>}

        {!isLoading && (
          <form className="preferences-form" onSubmit={(event) => void handleSave(event)}>
            <label className="preferences-field">
              <span className="preferences-field-label">LLM API key</span>
              <input
                type="password"
                value={llmConfig.LLM_API_KEY}
                autoComplete="off"
                onChange={(event) =>
                  setLlmConfig((current) => ({
                    ...current,
                    LLM_API_KEY: event.target.value,
                  }))
                }
              />
            </label>
            <label className="preferences-field">
              <span className="preferences-field-label">LLM model</span>
              <input
                type="text"
                value={llmConfig.LLM_MODEL}
                placeholder="gpt-4o-mini"
                onChange={(event) =>
                  setLlmConfig((current) => ({
                    ...current,
                    LLM_MODEL: event.target.value,
                  }))
                }
              />
            </label>
            <button
              type="submit"
              className="page-add-button"
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Save LLM configuration"}
            </button>
          </form>
        )}
      </section>

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
              <span className="preferences-token-total-cost">
                {" "}
                (roughly {formatCostUsd(tokenUsage.total_cost_usd)}$)
              </span>
            </span>
          </p>

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

      <AnkiConnectGuideModal
        isOpen={isGuideOpen}
        onClose={() => {
          setIsGuideOpen(false);
          void fetchAnkiStatus()
            .then(setAnkiStatus)
            .catch(() => {
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
        onSynced={() => void handleSyncCompleted()}
      />
    </Page>
  );
}
