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

const GAUGE_RADIUS = 18;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;

type LevelStat = { level: number; percent: number };

function levelStatsUpToLevel(
  grammarPoints: GrammarPoint[],
  maxLevel: number,
): LevelStat[] {
  const totalByLevel = new Map<number, number>();
  const doneByLevel = new Map<number, number>();

  for (const point of grammarPoints) {
    if (point.hsk_level > maxLevel) continue;
    totalByLevel.set(point.hsk_level, (totalByLevel.get(point.hsk_level) ?? 0) + 1);
    if (COMPLETED_STATUSES.has(point.status)) {
      doneByLevel.set(point.hsk_level, (doneByLevel.get(point.hsk_level) ?? 0) + 1);
    }
  }

  return [...totalByLevel.entries()]
    .sort(([levelA], [levelB]) => levelA - levelB)
    .map(([level, total]) => ({
      level,
      percent: Math.round(((doneByLevel.get(level) ?? 0) / total) * 100),
    }));
}

function LevelGauge({ level, percent }: LevelStat) {
  const offset = GAUGE_CIRCUMFERENCE - (percent / 100) * GAUGE_CIRCUMFERENCE;

  return (
    <div
      className={styles.grammarLevelGauge}
      title={`HSK ${level}: ${percent}% complete`}
    >
      <svg viewBox="0 0 44 44" className={styles.grammarLevelGaugeRing}>
        <circle cx="22" cy="22" r={GAUGE_RADIUS} className={styles.grammarLevelGaugeTrack} />
        <circle
          cx="22"
          cy="22"
          r={GAUGE_RADIUS}
          className={styles.grammarLevelGaugeProgress}
          strokeDasharray={GAUGE_CIRCUMFERENCE}
          strokeDashoffset={offset}
        />
        <text x="22" y="25" className={styles.grammarLevelGaugeText}>
          {percent}%
        </text>
      </svg>
      <span className={styles.grammarLevelGaugeLabel}>HSK {level}</span>
    </div>
  );
}

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

  // Grammar points requiring a higher HSK level than the learner's stay
  // fully hidden; ones at or below their level show up either unlocked or,
  // if a prerequisite isn't DONE/SKIP yet, locked (visible but not clickable).
  const visibleGrammarPoints = useMemo(() => {
    const statusById = new Map(
      grammarPoints.map((point) => [point.id, point.status]),
    );
    return grammarPoints
      .filter((point) => point.hsk_level <= currentHskLevel)
      .map((point) => ({
        grammarPoint: point,
        locked: !isGrammarPointAvailable(point, statusById),
      }));
  }, [grammarPoints, currentHskLevel]);

  const levelStats = useMemo(
    () => levelStatsUpToLevel(grammarPoints, currentHskLevel),
    [grammarPoints, currentHskLevel],
  );

  const { activeGrammarPoints, completedGrammarPoints } = useMemo(() => {
    return {
      activeGrammarPoints: visibleGrammarPoints.filter(
        (entry) => !COMPLETED_STATUSES.has(entry.grammarPoint.status),
      ),
      completedGrammarPoints: visibleGrammarPoints.filter((entry) =>
        COMPLETED_STATUSES.has(entry.grammarPoint.status),
      ),
    };
  }, [visibleGrammarPoints]);

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
    <Page
      title="Grammar"
      headerAction={
        levelStats.length > 0 && (
          <div className={styles.grammarLevelGauges}>
            {levelStats.map((stat) => (
              <LevelGauge key={stat.level} level={stat.level} percent={stat.percent} />
            ))}
          </div>
        )
      }
    >
      {isLoading && <p>Loading grammar points...</p>}
      {error && <p className="table-error">{error}</p>}
      {!isLoading && !error && (
        <>
          <div className={styles.grammarPointGrid}>
            {activeGrammarPoints.map(({ grammarPoint, locked }) => (
              <GrammarPointCard
                key={grammarPoint.id}
                grammarPoint={grammarPoint}
                onSelect={handleSelect}
                locked={locked}
                canSkip={
                  !locked &&
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
                {completedGrammarPoints.map(({ grammarPoint }) => (
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
