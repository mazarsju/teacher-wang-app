import type { ReactNode } from "react";
import styles from "./Page.module.css";

type PageProps = {
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
  headerCenter?: ReactNode;
  headerAction?: ReactNode;
  fullWidth?: boolean;
};

export default function Page({
  title,
  subtitle,
  children,
  headerCenter,
  headerAction,
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
      <header className={styles.pageHeader}>
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
