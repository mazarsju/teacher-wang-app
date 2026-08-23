import { useEffect, useMemo, useState } from "react";
import { scoreBand } from "../components/GrammarExercises";
import { CheckIcon, LockIcon } from "../components/icons";
import Page from "../components/Page";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { setGrammarPoints } from "../store/slices/grammarSlice";
import type { GrammarPoint } from "../types/grammarPoint";
import { fetchGrammarPoints } from "../utils/grammar/grammarPointsApi";
import GrammarPointDetailPage from "./GrammarPointDetailPage";
import styles from "./GrammarPage.module.css";

// A grammar point counts as done for both prerequisite-unlocking and level
// gauges once it's DONE or SKIP (the learner already knows it).
const COMPLETED_STATUSES = new Set(["DONE", "SKIP"]);

const STATUS_LABELS: Record<string, string> = {
  TODO: "Not started",
  WIP: "In progress",
  DONE: "Completed",
  SKIP: "Skipped",
};

// How many distinct pastel backgrounds the level sections cycle through.
const LEVEL_PALETTE_SIZE = 6;

const HSK_LEVEL_LABELS = [
  "Beginner",
  "Elementary",
  "Intermediate",
  "Upper Intermediate",
  "Advanced",
  "Mastery",
];

function hskLevelLabel(level: number): string {
  return HSK_LEVEL_LABELS[level - 1] ?? `Level ${level}`;
}

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

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status] ?? status;
  const modifier = styles[`grammar-status-${status.toLowerCase()}`] ?? "";

  return (
    <span className={`${styles.grammarStatus} ${modifier}`}>
      {status === "DONE" ? (
        <CheckIcon className={styles.grammarStatusIcon} />
      ) : (
        <span className={styles.grammarStatusDot} />
      )}
      {label}
    </span>
  );
}

function ScoreValue({ score }: { score: number | null }) {
  if (score == null) return null;
  const modifier = styles[`grammar-score-${scoreBand(score)}`] ?? "";
  return <span className={`${styles.grammarScore} ${modifier}`}>{score}%</span>;
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
  const maxHskLevel = useAppSelector((state) => state.hsk.status?.max_level);
  // Achieved level is already done; the learner is aiming at the next one
  // (capped at the catalog max), so that level's topics are available too.
  const targetHskLevel = Math.min(
    currentHskLevel + 1,
    maxHskLevel ?? currentHskLevel + 1,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedGrammarId, setSelectedGrammarId] = useState<string | null>(
    null,
  );

  // Grammar points above the target level stay fully hidden; ones at or
  // below it show up either unlocked or, if a prerequisite isn't DONE/SKIP
  // yet, locked (visible but not clickable).
  const visibleGrammarPoints = useMemo(() => {
    const statusById = new Map(
      grammarPoints.map((point) => [point.id, point.status]),
    );
    return grammarPoints
      .filter((point) => point.hsk_level <= targetHskLevel)
      .map((point) => ({
        grammarPoint: point,
        locked: !isGrammarPointAvailable(point, statusById),
      }));
  }, [grammarPoints, targetHskLevel]);

  const levelStats = useMemo(
    () => levelStatsUpToLevel(grammarPoints, targetHskLevel),
    [grammarPoints, targetHskLevel],
  );

  const levelSections = useMemo(() => {
    const byLevel = new Map<number, typeof visibleGrammarPoints>();
    for (const entry of visibleGrammarPoints) {
      const level = entry.grammarPoint.hsk_level;
      const bucket = byLevel.get(level);
      if (bucket) {
        bucket.push(entry);
      } else {
        byLevel.set(level, [entry]);
      }
    }
    return [...byLevel.entries()]
      .sort(([levelA], [levelB]) => levelA - levelB)
      .map(([level, entries]) => ({
        level,
        entries: entries
          .slice()
          .sort((a, b) => a.grammarPoint.index - b.grammarPoint.index),
      }));
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
      {!isLoading &&
        !error &&
        levelSections.map(({ level, entries }) => {
          const paletteIndex = ((level - 1) % LEVEL_PALETTE_SIZE) + 1;
          return (
            <details
              key={level}
              open
              className={`${styles.grammarLevelSection} ${
                styles[`grammar-level-section-${paletteIndex}`] ?? ""
              }`}
            >
              <summary className={styles.grammarLevelSummary}>
                HSK {level} ({hskLevelLabel(level)})
              </summary>
              <table className={styles.grammarTable}>
                <thead>
                  <tr>
                    <th className={styles.grammarTableColNumber}>#</th>
                    <th>Lesson</th>
                    <th>Status</th>
                    <th>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(({ grammarPoint, locked }) => (
                    <tr
                      key={grammarPoint.id}
                      role="button"
                      tabIndex={locked ? -1 : 0}
                      aria-disabled={locked}
                      title={grammarPoint.title}
                      className={
                        locked
                          ? `${styles.grammarRow} ${styles.grammarRowLocked}`
                          : styles.grammarRow
                      }
                      onClick={locked ? undefined : () => handleSelect(grammarPoint)}
                      onKeyDown={
                        locked
                          ? undefined
                          : (event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                handleSelect(grammarPoint);
                              }
                            }
                      }
                    >
                      <td>{grammarPoint.index}</td>
                      <td className={styles.grammarRowTitle}>
                        {locked && (
                          <LockIcon className={styles.grammarRowLockIcon} />
                        )}
                        <span className={styles.grammarRowTitleText}>
                          {grammarPoint.title}
                        </span>
                      </td>
                      <td>
                        <StatusBadge status={grammarPoint.status} />
                      </td>
                      <td>
                        <ScoreValue score={grammarPoint.score} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          );
        })}
    </Page>
  );
}
