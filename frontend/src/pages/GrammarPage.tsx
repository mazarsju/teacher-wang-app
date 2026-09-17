import type { TFunction } from "i18next";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { scoreBand } from "../components/GrammarExercises";
import { CheckIcon, LockIcon, PenIcon, StarIcon } from "../components/icons";
import Page from "../components/Page";
import { useAppSelector } from "../store/hooks";
import type { GrammarPoint } from "../types/grammarPoint";
import type { WritingTopic } from "../types/writingTopic";
import { fetchCurrentUser } from "../utils/auth/meApi";
import { HSK_MAX_LEVEL } from "../utils/knowledgeBase/hskLevelApi";
import GrammarPointDetailPage from "./GrammarPointDetailPage";
import styles from "./GrammarPage.module.css";
import WritingPracticeDetailPage from "./WritingPracticeDetailPage";

// A grammar point counts as done for both prerequisite-unlocking and level
// gauges once it's DONE, SKIP, or MASTERED (the learner already knows it).
const COMPLETED_STATUSES = new Set(["DONE", "SKIP", "MASTERED"]);

// Free-plan users only get the first 10 lessons of each HSK level unlocked.
const FREE_PLAN_LESSON_LIMIT = 10;

// Matches the backend's MASTERY_THRESHOLD (check_grammar_point.py /
// record_grammar_usage.py): a DONE point flips to MASTERED once its
// real-life usage count reaches this.
const MASTERY_THRESHOLD = 3;

const STATUS_LABEL_KEYS: Record<string, string> = {
  TODO: "todo",
  WIP: "wip",
  DONE: "done",
  SKIP: "skip",
  MASTERED: "mastered",
};

// How many distinct pastel backgrounds the level sections cycle through.
const LEVEL_PALETTE_SIZE = 6;

const HSK_LEVEL_LABEL_KEYS = [
  "beginner",
  "elementary",
  "intermediate",
  "upperIntermediate",
  "advanced",
  "mastery",
];

function hskLevelLabel(t: TFunction, level: number): string {
  const key = HSK_LEVEL_LABEL_KEYS[level - 1];
  return key
    ? t(`grammarPage.levelLabels.${key}`)
    : t("grammarPage.levelLabels.fallback", { level });
}

const GAUGE_RADIUS = 18;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;

type LevelStat = { level: number; percent: number };

type LevelRow =
  | { kind: "grammar"; grammarPoint: GrammarPoint; locked: boolean; levelLoaded: boolean }
  | { kind: "writing"; topic: WritingTopic };

function CellSpinner() {
  const { t } = useTranslation("grammar");
  return <span className={styles.grammarCellSpinner} aria-label={t("grammarPage.loading")} />;
}

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
  const { t } = useTranslation("grammar");
  const offset = GAUGE_CIRCUMFERENCE - (percent / 100) * GAUGE_CIRCUMFERENCE;

  return (
    <div
      className={styles.grammarLevelGauge}
      title={t("grammarPage.levelGauge.title", { level, percent })}
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
      <span className={styles.grammarLevelGaugeLabel}>
        {t("grammarPage.levelGauge.label", { level })}
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation("grammar");
  const statusKey = STATUS_LABEL_KEYS[status];
  const label = statusKey ? t(`grammarPage.status.${statusKey}`) : status;
  const modifier = styles[`grammar-status-${status.toLowerCase()}`] ?? "";

  return (
    <span className={`${styles.grammarStatus} ${modifier}`}>
      {status === "DONE" ? (
        <CheckIcon className={styles.grammarStatusIcon} />
      ) : status === "MASTERED" ? (
        <StarIcon className={styles.grammarStatusIcon} />
      ) : (
        <span className={styles.grammarStatusDot} />
      )}
      {label}
    </span>
  );
}

// A 5-point star centered on (0,0) with an outer radius of 1, so it can be
// placed via a plain translate+scale transform.
const PYRAMID_STAR_PATH =
  "M0,-1 L0.22,-0.31 L0.95,-0.31 L0.36,0.12 L0.59,0.81 L0,0.38 L-0.59,0.81 L-0.36,0.12 L-0.95,-0.31 L-0.22,-0.31 Z";

// One star on top, two on the base — lit up left-to-right-ish (top, then
// bottom-left, then bottom-right) as usage/MASTERY_THRESHOLD count comes in.
const PYRAMID_STAR_POSITIONS = [
  { x: 12, y: 7 },
  { x: 6.6, y: 17 },
  { x: 17.4, y: 17 },
];
const PYRAMID_STAR_SCALE = 5.6;

// Single badge icon combining 3 stars (pyramid layout), shown next to the
// score for a DONE lesson — lit stars count usage towards MASTERY_THRESHOLD.
function PracticeStars({ count }: { count: number }) {
  const { t } = useTranslation("grammar");
  const activeCount = Math.min(count, MASTERY_THRESHOLD);

  const tooltip = t("grammarPage.practiceCount", { count, total: MASTERY_THRESHOLD });

  // A native `title` here gets shadowed by the row's own title (the lesson
  // name) since the row is a large hoverable target too, so the count is
  // shown via a CSS-driven tooltip instead; `title` stays as an accessible
  // fallback (e.g. for screen readers exposing it as the accessible name).
  return (
    <span className={styles.grammarPracticeStars} title={tooltip}>
      <svg viewBox="0 0 24 24" className={styles.grammarPracticeStarsIcon} aria-hidden="true">
        {PYRAMID_STAR_POSITIONS.map((position, index) => (
          <g
            key={index}
            className={
              index < activeCount
                ? styles.grammarPracticeStarActive
                : styles.grammarPracticeStarInactive
            }
            transform={`translate(${position.x},${position.y}) scale(${PYRAMID_STAR_SCALE})`}
          >
            <path d={PYRAMID_STAR_PATH} fill="currentColor" />
          </g>
        ))}
      </svg>
      <span className={styles.grammarPracticeStarsTooltip} role="tooltip">
        {tooltip}
      </span>
    </span>
  );
}

function ScoreValue({ score, status }: { score: number | null; status: string }) {
  if (score == null) return null;
  const modifier =
    (status === "MASTERED"
      ? styles["grammar-score-mastered"]
      : styles[`grammar-score-${scoreBand(score)}`]) ?? "";
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
  const { t } = useTranslation("grammar");
  const grammarPoints = useAppSelector((state) => state.grammar.items);
  const writingPractices = useAppSelector((state) => state.grammar.writingPractices);
  const isLoading = useAppSelector((state) => !state.grammar.loaded);
  const error = useAppSelector((state) => state.grammar.error);
  const loadedLevels = useAppSelector((state) => state.grammar.loadedLevels);
  const currentHskLevel = useAppSelector((state) => state.hsk.currentLevelLight ?? 0);
  // Achieved level is already done; the learner is aiming at the next one
  // (capped at the catalog max), so that level's topics are available too.
  const targetHskLevel = Math.min(currentHskLevel + 1, HSK_MAX_LEVEL);
  const [selectedGrammarId, setSelectedGrammarId] = useState<string | null>(
    null,
  );
  const [selectedWritingTopicId, setSelectedWritingTopicId] = useState<
    string | null
  >(null);
  const [plan, setPlan] = useState<string | null>(null);

  useEffect(() => {
    fetchCurrentUser()
      .then((user) => setPlan(user.plan))
      .catch(() => setPlan(null));
  }, []);

  // Grammar points above the target level stay fully hidden; ones at or
  // below it show up either unlocked or, if a prerequisite isn't DONE/SKIP
  // yet, or (on the free plan) past the first 10 lessons of their level,
  // locked (visible but not clickable).
  const visibleGrammarPoints = useMemo(() => {
    const statusById = new Map(
      grammarPoints.map((point) => [point.id, point.status]),
    );
    return grammarPoints
      .filter((point) => point.hsk_level <= targetHskLevel)
      .map((point) => {
        const levelLoaded = loadedLevels.includes(point.hsk_level);
        return {
          grammarPoint: point,
          levelLoaded,
          // Until this level's real status/prerequisites have arrived, the
          // placeholder "TODO" data would otherwise show every row as
          // locked; treat it as unlocked instead so the row just looks like
          // it's still loading (via the status/score spinners) rather than
          // flashing a lock icon that isn't real.
          locked:
            levelLoaded &&
            (!isGrammarPointAvailable(point, statusById) ||
              (plan === "free" && point.index > FREE_PLAN_LESSON_LIMIT)),
        };
      });
  }, [grammarPoints, targetHskLevel, plan, loadedLevels]);

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
      .map(([level, entries]) => {
        const sortedEntries = entries
          .slice()
          .sort((a, b) => a.grammarPoint.index - b.grammarPoint.index);
        const rows: LevelRow[] = [];
        for (const entry of sortedEntries) {
          rows.push({ kind: "grammar", ...entry });
          for (const topic of writingPractices) {
            if (topic.after_grammar_point === entry.grammarPoint.id) {
              rows.push({ kind: "writing", topic });
            }
          }
        }
        return { level, rows };
      });
  }, [visibleGrammarPoints, writingPractices]);

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

  if (selectedWritingTopicId !== null) {
    return (
      <WritingPracticeDetailPage
        topicId={selectedWritingTopicId}
        onBack={() => setSelectedWritingTopicId(null)}
      />
    );
  }

  return (
    <Page
      title={t("grammarPage.title")}
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
      {isLoading && <p>{t("grammarPage.loading")}</p>}
      {error && <p className="table-error">{error}</p>}
      {!isLoading &&
        !error &&
        levelSections.map(({ level, rows }) => {
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
                {t("grammarPage.levelSummary", {
                  level,
                  levelLabel: hskLevelLabel(t, level),
                })}
              </summary>
              <table className={styles.grammarTable}>
                <thead>
                  <tr>
                    <th className={styles.grammarTableColNumber}>
                      {t("grammarPage.table.number")}
                    </th>
                    <th>{t("grammarPage.table.lesson")}</th>
                    <th>{t("grammarPage.table.status")}</th>
                    <th>{t("grammarPage.table.score")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) =>
                    row.kind === "writing" ? (
                      <tr
                        key={row.topic.id}
                        role="button"
                        tabIndex={0}
                        title={row.topic.title}
                        className={`${styles.grammarRowWriting} ${
                          styles[`grammar-row-writing-${paletteIndex}`] ?? ""
                        }`}
                        onClick={() => setSelectedWritingTopicId(row.topic.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedWritingTopicId(row.topic.id);
                          }
                        }}
                      >
                        <td />
                        <td className={styles.grammarRowTitle}>
                          <PenIcon className={styles.grammarRowWritingIcon} />
                          <span className={styles.grammarRowTitleText}>
                            {t("grammarPage.practiceLabel", { title: row.topic.title })}
                          </span>
                        </td>
                        <td>
                          <StatusBadge status={row.topic.status} />
                        </td>
                        <td />
                      </tr>
                    ) : (
                      <tr
                        key={row.grammarPoint.id}
                        role="button"
                        tabIndex={row.locked || !row.levelLoaded ? -1 : 0}
                        aria-disabled={row.locked || !row.levelLoaded}
                        title={row.grammarPoint.title}
                        className={
                          row.locked
                            ? `${styles.grammarRow} ${styles.grammarRowLocked}`
                            : styles.grammarRow
                        }
                        onClick={
                          row.locked || !row.levelLoaded
                            ? undefined
                            : () => handleSelect(row.grammarPoint)
                        }
                        onKeyDown={
                          row.locked || !row.levelLoaded
                            ? undefined
                            : (event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  handleSelect(row.grammarPoint);
                                }
                              }
                        }
                      >
                        <td>{row.grammarPoint.index}</td>
                        <td className={styles.grammarRowTitle}>
                          {row.locked && (
                            <LockIcon className={styles.grammarRowLockIcon} />
                          )}
                          <span className={styles.grammarRowTitleText}>
                            {row.grammarPoint.title}
                          </span>
                        </td>
                        <td>
                          {row.levelLoaded ? (
                            <StatusBadge status={row.grammarPoint.status} />
                          ) : (
                            <CellSpinner />
                          )}
                        </td>
                        <td>
                          {row.levelLoaded ? (
                            <span className={styles.grammarScoreCell}>
                              {row.grammarPoint.status === "DONE" && (
                                <PracticeStars count={row.grammarPoint.usage_count ?? 0} />
                              )}
                              <ScoreValue
                                score={row.grammarPoint.score}
                                status={row.grammarPoint.status}
                              />
                            </span>
                          ) : (
                            <CellSpinner />
                          )}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </details>
          );
        })}
    </Page>
  );
}
