import { useEffect, useState } from "react";
import GrammarPointCard from "../components/GrammarPointCard";
import Page from "../components/Page";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { setGrammarPoints } from "../store/slices/grammarSlice";
import type { GrammarPoint } from "../types/grammarPoint";
import { fetchGrammarPoints } from "../utils/grammar/grammarPointsApi";
import styles from "./GrammarPage.module.css";

export default function GrammarPage() {
  const dispatch = useAppDispatch();
  const grammarPoints = useAppSelector((state) => state.grammar.items);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  function handleSelect(_grammarPoint: GrammarPoint) {
    // Detail view will open once the S3-backed detail endpoint exists.
  }

  return (
    <Page title="Grammar">
      {isLoading && <p>Loading grammar points...</p>}
      {error && <p className="table-error">{error}</p>}
      {!isLoading && !error && (
        <div className={styles.grammarPointGrid}>
          {grammarPoints.map((grammarPoint) => (
            <GrammarPointCard
              key={grammarPoint.id}
              grammarPoint={grammarPoint}
              onSelect={handleSelect}
            />
          ))}
        </div>
      )}
    </Page>
  );
}
