import { useEffect, useMemo, useState } from "react";
import GrammarPointCard from "../components/GrammarPointCard";
import Page from "../components/Page";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import {
  setGrammarPointStatus,
  setGrammarPoints,
} from "../store/slices/grammarSlice";
import type { GrammarPoint } from "../types/grammarPoint";
import {
  fetchGrammarPoints,
  skipGrammarPoint,
} from "../utils/grammar/grammarPointsApi";
import GrammarPointDetailPage from "./GrammarPointDetailPage";
import styles from "./GrammarPage.module.css";

// A grammar point counts as done for both prerequisite-unlocking and the
// "completed" section once it's DONE or SKIP (the learner already knows it).
const COMPLETED_STATUSES = new Set(["DONE", "SKIP"]);

// Available means unlocked, not "not yet done": no prerequisites, or every
// prerequisite is already DONE/SKIP. A grammar point already DONE or SKIP
// itself still shows up here as long as its own prerequisites are satisfied.
function isGrammarPointAvailable(
  grammarPoint: GrammarPoint,
  statusById: Map<string, string>,
): boolean {
  return grammarPoint.prerequisites.every((prerequisiteId) =>
    COMPLETED_STATUSES.has(statusById.get(prerequisiteId) ?? ""),
  );
}

export default function GrammarPage() {
  const dispatch = useAppDispatch();
  const grammarPoints = useAppSelector((state) => state.grammar.items);
  const currentHskLevel = useAppSelector(
    (state) => state.hsk.status?.current_level ?? 0,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedGrammarId, setSelectedGrammarId] = useState<string | null>(
    null,
  );

  const availableGrammarPoints = useMemo(() => {
    const statusById = new Map(
      grammarPoints.map((point) => [point.id, point.status]),
    );
    return grammarPoints.filter((point) =>
      isGrammarPointAvailable(point, statusById),
    );
  }, [grammarPoints]);

  const { activeGrammarPoints, completedGrammarPoints } = useMemo(() => {
    return {
      activeGrammarPoints: availableGrammarPoints.filter(
        (point) => !COMPLETED_STATUSES.has(point.status),
      ),
      completedGrammarPoints: availableGrammarPoints.filter((point) =>
        COMPLETED_STATUSES.has(point.status),
      ),
    };
  }, [availableGrammarPoints]);

  useEffect(() => {
    let cancelled = false;

    fetchGrammarPoints()
      .then((points) => {
        if (!cancelled) {
          dispatch(setGrammarPoints(points));
        }
      })
      .catch((fetchError) => {
        if (!cancelled) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : "Failed to load grammar points.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  function handleSelect(grammarPoint: GrammarPoint) {
    setSelectedGrammarId(grammarPoint.id);
  }

  async function handleSkip(grammarPoint: GrammarPoint) {
    try {
      await skipGrammarPoint(grammarPoint.id);
      dispatch(setGrammarPointStatus({ id: grammarPoint.id, status: "SKIP" }));
    } catch (skipError) {
      setError(
        skipError instanceof Error
          ? skipError.message
          : "Failed to mark grammar point as known.",
      );
    }
  }

  if (selectedGrammarId !== null) {
    return (
      <GrammarPointDetailPage
        grammarId={selectedGrammarId}
        onBack={() => setSelectedGrammarId(null)}
      />
    );
  }

  return (
    <Page title="Grammar">
      {isLoading && <p>Loading grammar points...</p>}
      {error && <p className="table-error">{error}</p>}
      {!isLoading && !error && (
        <>
          <div className={styles.grammarPointGrid}>
            {activeGrammarPoints.map((grammarPoint) => (
              <GrammarPointCard
                key={grammarPoint.id}
                grammarPoint={grammarPoint}
                onSelect={handleSelect}
                canSkip={
                  grammarPoint.hsk_level < currentHskLevel &&
                  grammarPoint.status === "TODO"
                }
                onSkip={handleSkip}
              />
            ))}
          </div>
          {completedGrammarPoints.length > 0 && (
            <details className={styles.grammarCompletedSection}>
              <summary className={styles.grammarCompletedSummary}>
                Completed grammar topics ({completedGrammarPoints.length})
              </summary>
              <div className={styles.grammarPointGrid}>
                {completedGrammarPoints.map((grammarPoint) => (
                  <GrammarPointCard
                    key={grammarPoint.id}
                    grammarPoint={grammarPoint}
                    onSelect={handleSelect}
                  />
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </Page>
  );
}
