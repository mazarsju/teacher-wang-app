import type { ReactNode } from "react";
import styles from "./Page.module.css";

type PageProps = {
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
  headerCenter?: ReactNode;
  headerAction?: ReactNode;
  /** Keep headerAction on the title's row on mobile instead of wrapping it below. Only suited to a small, fixed-width action (e.g. an icon-only overflow button) — a wide action would get squeezed. */
  headerActionInline?: boolean;
  fullWidth?: boolean;
};

export default function Page({
  title,
  subtitle,
  children,
  headerCenter,
  headerAction,
  headerActionInline = false,
  fullWidth = false,
}: PageProps) {
  return (
    <section
      className={
        fullWidth
          ? `${styles.page} ${styles.pageFullWidth}`
          : styles.page
      }
    >
      <header
        className={
          headerActionInline
            ? `${styles.pageHeader} ${styles.pageHeaderActionInline}`
            : styles.pageHeader
        }
      >
        <div className={styles.pageHeaderTitleGroup}>
          <h1>{title}</h1>
          {subtitle && <p className={styles.pageHeaderSubtitle}>{subtitle}</p>}
        </div>
        {headerCenter}
        {headerAction}
      </header>
      <div className={styles.pageContent}>{children}</div>
    </section>
  );
}
