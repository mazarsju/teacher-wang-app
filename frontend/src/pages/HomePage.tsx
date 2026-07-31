import { useEffect, useMemo, useState } from "react";
import MissingHskCharactersModal from "../components/MissingHskCharactersModal";
import { InfoIcon, TrophyIcon } from "../components/icons";
import Page from "../components/Page";
import type { Character } from "../types/character";
import { getMotivationMessages } from "../utils/knowledgeBase/homeMotivation";
import { API_BASE } from "../utils/apiBase";
import { apiFetch } from "../utils/auth/apiFetch";
import {
  fetchHskLevelStatus,
  type HskLevelStatus,
} from "../utils/knowledgeBase/hskLevelApi";

async function fetchCharacters() {
  const response = await apiFetch(`${API_BASE}/characters`, { method: "GET" });

  if (!response.ok) {
    throw new Error("Failed to load characters.");
  }

  return (await response.json()) as Character[];
}

export default function HomePage() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [hskLevelStatus, setHskLevelStatus] = useState<HskLevelStatus | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMissingModalOpen, setIsMissingModalOpen] = useState(false);
  const [isHskInfoOpen, setIsHskInfoOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    void Promise.all([fetchCharacters(), fetchHskLevelStatus()])
      .then(([loadedCharacters, loadedHskLevelStatus]) => {
        if (isMounted) {
          setCharacters(loadedCharacters);
          setHskLevelStatus(loadedHskLevelStatus);
        }
      })
      .catch((fetchError: unknown) => {
        if (isMounted) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : "Failed to load progress.",
          );
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const recognizedCount = characters.length;
  const writtingCount = useMemo(
    () => characters.filter((character) => character.writting_known).length,
    [characters],
  );
  const motivationMessages = useMemo(
    () => getMotivationMessages(recognizedCount),
    [recognizedCount],
  );

  const hskTitle =
    hskLevelStatus === null
      ? ""
      : hskLevelStatus.current_level === null
        ? "Your HSK journey starts here"
        : hskLevelStatus.current_level === hskLevelStatus.max_level
          ? `You've reached the top — HSK ${hskLevelStatus.max_level}!`
          : `You're at HSK ${hskLevelStatus.current_level}!`;

  const hskProgressLabel =
    hskLevelStatus === null
      ? ""
      : hskLevelStatus.next_level === null
        ? "Maximum HSK level reached. Outstanding work!"
        : `${hskLevelStatus.characters_to_next_level} ${
            hskLevelStatus.characters_to_next_level === 1
              ? "character"
              : "characters"
          } to reach HSK ${hskLevelStatus.next_level}`;

  const completionPercent =
    hskLevelStatus === null
      ? 0
      : Math.round(hskLevelStatus.completion_ratio * 100);

  return (
    <Page title="Home">
      {isLoading && <p>Loading your progress...</p>}
      {error && <p className="table-error">{error}</p>}
      {!isLoading && !error && hskLevelStatus !== null && (
        <>
          <section className="home-hsk-card" aria-label="HSK level">
            <div className="home-hsk-badge">
              <span className="home-hsk-badge-label">HSK</span>
              <span className="home-hsk-badge-level">
                {hskLevelStatus.current_level ?? "—"}
              </span>
            </div>
            <div className="home-hsk-content">
              <div className="home-hsk-title-row">
                <p className="home-hsk-title">{hskTitle}</p>
                <button
                  type="button"
                  className="home-hsk-info-button"
                  aria-label="How HSK level is estimated"
                  onClick={() => setIsHskInfoOpen(true)}
                >
                  <InfoIcon className="home-hsk-info-icon" />
                </button>
              </div>
              <div
                className="home-hsk-progress-track"
                role="progressbar"
                aria-valuenow={Math.round(hskLevelStatus.progress_to_next_level)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Progress to next HSK level"
              >
                <div
                  className="home-hsk-progress-fill"
                  style={{
                    width: `${hskLevelStatus.progress_to_next_level}%`,
                  }}
                />
              </div>
              <div className="home-hsk-progress-footer">
                <p className="home-hsk-progress-label">{hskProgressLabel}</p>
                {hskLevelStatus.next_level !== null && (
                  <button
                    type="button"
                    className="home-hsk-missing-button"
                    onClick={() => setIsMissingModalOpen(true)}
                  >
                    Missing characters
                  </button>
                )}
              </div>
            </div>
          </section>

          <div className="home-metrics">
            <div className="home-metric-card">
              <p className="home-metric-value">{recognizedCount}</p>
              <p className="home-metric-label">
                Characters you are able to recognize
              </p>
            </div>
            <div className="home-metric-card">
              <p className="home-metric-value">{writtingCount}</p>
              <p className="home-metric-label">Characters you can write</p>
            </div>
          </div>

          {motivationMessages.length > 0 && (
            <ul className="home-motivation-list">
              {motivationMessages.map((message) => (
                <li key={message} className="home-motivation-item">
                  <TrophyIcon className="home-motivation-icon" />
                  <span>{message}</span>
                </li>
              ))}
            </ul>
          )}

          {isHskInfoOpen && (
            <div className="modal-overlay" onClick={() => setIsHskInfoOpen(false)}>
              <div
                className="modal-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="hsk-level-info-title"
                onClick={(event) => event.stopPropagation()}
              >
                <h2 id="hsk-level-info-title" className="modal-title">
                  How HSK level is estimated
                </h2>
                <div className="character-words-modal-content">
                  <p className="home-hsk-info-text">
                    This HSK level is an estimate based on the characters you know.
                    A level counts as reached when you know at least{" "}
                    {completionPercent}% of all characters expected up to that
                    level — for example, HSK 3 needs {completionPercent}% of HSK
                    1, 2, and 3 combined. The missing-characters list includes gaps
                    from earlier levels too, so you can fill those first. Less
                    useful characters can wait while you learn more frequent ones.
                  </p>
                </div>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="modal-button-cancel"
                    onClick={() => setIsHskInfoOpen(false)}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          <MissingHskCharactersModal
            isOpen={isMissingModalOpen}
            level={hskLevelStatus.next_level}
            characters={hskLevelStatus.missing_characters}
            onClose={() => setIsMissingModalOpen(false)}
          />
        </>
      )}
    </Page>
  );
}
