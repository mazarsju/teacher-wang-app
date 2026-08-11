import type { ReactNode } from "react";
import styles from "./Page.module.css";

type PageProps = {
  title: string;
  children?: ReactNode;
  headerCenter?: ReactNode;
  headerAction?: ReactNode;
  fullWidth?: boolean;
};

export default function Page({
  title,
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
        <h1>{title}</h1>
        {headerCenter}
        {headerAction}
      </header>
      <div className={styles.pageContent}>{children}</div>
    </section>
  );
}
