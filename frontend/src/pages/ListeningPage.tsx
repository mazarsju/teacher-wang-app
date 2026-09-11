import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Page from "../components/Page";
import type { ListeningPractice } from "../types/listeningPractice";
import { fetchListeningPractices } from "../utils/listening/listeningApi";
import styles from "./ListeningPage.module.css";

const STATUS_LABEL_KEYS: Record<string, string> = {
  TODO: "todo",
  WIP: "wip",
  DONE: "done",
};

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation("listening");
  const statusKey = STATUS_LABEL_KEYS[status];
  const label = statusKey ? t(`listeningPage.status.${statusKey}`) : status;
  const modifier = styles[`listening-status-${status.toLowerCase()}`] ?? "";

  return (
    <span className={`${styles.listeningStatus} ${modifier}`}>{label}</span>
  );
}

export default function ListeningPage() {
  const { t } = useTranslation("listening");
  const [practices, setPractices] = useState<ListeningPractice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchListeningPractices()
      .then((result) => {
        if (!cancelled) {
          setPractices(result);
        }
      })
      .catch((fetchError) => {
        if (!cancelled) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : t("listeningPage.loadError"),
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
  }, [t]);

  return (
    <Page title={t("listeningPage.title")}>
      {isLoading && <p>{t("listeningPage.loading")}</p>}
      {error && <p className="table-error">{error}</p>}
      {!isLoading && !error && practices.length === 0 && (
        <p>{t("listeningPage.empty")}</p>
      )}
      {!isLoading && !error && practices.length > 0 && (
        <table className={styles.listeningTable}>
          <thead>
            <tr>
              <th>{t("listeningPage.table.level")}</th>
              <th>{t("listeningPage.table.title")}</th>
              <th>{t("listeningPage.table.status")}</th>
              <th>{t("listeningPage.table.vocabulary")}</th>
              <th>{t("listeningPage.table.grammar")}</th>
            </tr>
          </thead>
          <tbody>
            {practices.map((practice) => (
              <tr key={practice.id} className={styles.listeningRow}>
                <td>{practice.hsk_level}</td>
                <td className={styles.listeningRowTitle}>{practice.title}</td>
                <td>
                  <StatusBadge status={practice.status} />
                </td>
                <td>{practice.vocabulary_score}%</td>
                <td>{practice.grammar_score}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Page>
  );
}
