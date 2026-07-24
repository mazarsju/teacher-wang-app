import { useCallback, useEffect, useState, type FormEvent } from "react";
import Page from "../components/Page";
import type { LlmConfig } from "../types/llmConfig";
import type { TokenUsageSummary } from "../types/tokenUsage";
import { fetchLlmConfig, saveLlmConfig } from "../utils/llmConfigApi";
import { fetchTokenUsage } from "../utils/tokenUsageApi";

const emptyLlmConfig: LlmConfig = {
  LLM_API_KEY: "",
  LLM_MODEL: "",
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

export default function PreferencesPage() {
  const [llmConfig, setLlmConfig] = useState<LlmConfig>(emptyLlmConfig);
  const [tokenUsage, setTokenUsage] = useState<TokenUsageSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const loadPreferences = useCallback(async () => {
    setError(null);

    try {
      const [config, usage] = await Promise.all([
        fetchLlmConfig(),
        fetchTokenUsage(),
      ]);
      setLlmConfig(config);
      setTokenUsage(usage);
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

  const maxDailyTokens = Math.max(
    1,
    ...(tokenUsage?.days.map((day) => day.tokens) ?? [0]),
  );

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
    </Page>
  );
}
