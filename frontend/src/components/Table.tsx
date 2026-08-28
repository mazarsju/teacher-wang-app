import type { CSSProperties, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import styles from "./Table.module.css";

export type TableColumn<T> = {
  key: keyof T & string;
  header: string;
  render?: (row: T) => ReactNode;
};

type TableProps<T> = {
  columns: TableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  emptyMessage?: string;
  renderRowActions?: (row: T) => ReactNode;
  compact?: boolean;
  maxVisibleRows?: number;
  maxHeight?: string;
};

export default function Table<T>({
  columns,
  rows,
  getRowKey,
  emptyMessage,
  renderRowActions,
  compact = false,
  maxVisibleRows,
  maxHeight,
}: TableProps<T>) {
  const { t } = useTranslation("common");

  if (rows.length === 0) {
    return <p className={styles.tableEmpty}>{emptyMessage ?? t("table.emptyMessage")}</p>;
  }

  const wrapperClassName = [
    styles.tableWrapper,
    compact && styles.tableWrapperCompact,
    (maxVisibleRows !== undefined || maxHeight !== undefined) &&
      styles.tableWrapperScrollable,
  ]
    .filter(Boolean)
    .join(" ");

  const tableClassName = [styles.table, compact && styles.tableCompact]
    .filter(Boolean)
    .join(" ");

  const wrapperStyle = maxHeight
    ? ({ maxHeight } as CSSProperties)
    : maxVisibleRows !== undefined
      ? ({
          "--table-visible-rows": maxVisibleRows,
        } as CSSProperties)
      : undefined;

  return (
    <div className={wrapperClassName} style={wrapperStyle}>
      <table className={tableClassName}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.header}</th>
            ))}
            {renderRowActions && <th className={styles.tableActionsHeader} />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getRowKey(row)} className={styles.tableRow}>
              {columns.map((column) => (
                <td key={column.key}>
                  {column.render ? column.render(row) : String(row[column.key])}
                </td>
              ))}
              {renderRowActions && (
                <td className={styles.tableActions}>{renderRowActions(row)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
