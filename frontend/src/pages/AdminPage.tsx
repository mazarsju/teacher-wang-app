import { useCallback, useEffect, useState } from "react";
import Button from "../components/Button";
import ConfirmModal from "../components/ConfirmModal";
import { SyncIcon } from "../components/icons";
import Page from "../components/Page";
import Table, { type TableColumn } from "../components/Table";
import type { AdminUser, UserPlan } from "../types/adminUser";
import {
  deleteUser,
  fetchUsers,
  generateArticles,
  reloadHskContent,
  updateUserPlan,
} from "../utils/admin/adminApi";
import styles from "./AdminPage.module.css";

const USER_COLUMNS: TableColumn<AdminUser>[] = [
  { key: "email", header: "Email" },
  { key: "plan", header: "Plan" },
  {
    key: "last_connection",
    header: "Last connection",
    render: (row) => new Date(row.last_connection).toLocaleString(),
  },
];

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [userPendingDelete, setUserPendingDelete] = useState<AdminUser | null>(
    null,
  );
  const [isReloadingHsk, setIsReloadingHsk] = useState(false);
  const [isReloadHskConfirmOpen, setIsReloadHskConfirmOpen] = useState(false);
  const [isGeneratingArticles, setIsGeneratingArticles] = useState(false);

  const loadUsers = useCallback(async () => {
    setError(null);
    try {
      setUsers(await fetchUsers());
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Failed to load users.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  async function handlePlanChange(user: AdminUser, plan: UserPlan) {
    if (plan === user.plan) {
      return;
    }
    setUpdatingId(user.id);
    setError(null);
    try {
      const updated = await updateUserPlan(user.id, plan);
      setUsers((current) =>
        current.map((row) => (row.id === updated.id ? updated : row)),
      );
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Failed to update user.",
      );
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleConfirmDelete() {
    if (!userPendingDelete) {
      return;
    }
    const user = userPendingDelete;
    setDeletingId(user.id);
    setError(null);
    try {
      await deleteUser(user.id);
      setUsers((current) => current.filter((row) => row.id !== user.id));
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete user.",
      );
    } finally {
      setDeletingId(null);
      setUserPendingDelete(null);
    }
  }

  async function handleConfirmReloadHsk() {
    setIsReloadHskConfirmOpen(false);
    setIsReloadingHsk(true);
    setError(null);
    try {
      await reloadHskContent();
    } catch (reloadError) {
      setError(
        reloadError instanceof Error
          ? reloadError.message
          : "Failed to reload the HSK database.",
      );
    } finally {
      setIsReloadingHsk(false);
    }
  }

  async function handleGenerateArticles() {
    setIsGeneratingArticles(true);
    setError(null);
    try {
      await generateArticles();
    } catch (generateError) {
      setError(
        generateError instanceof Error
          ? generateError.message
          : "Failed to refresh articles.",
      );
    } finally {
      setIsGeneratingArticles(false);
    }
  }

  return (
    <Page title="Admin">
      {isLoading && <p>Loading users...</p>}
      {error && <p className="table-error">{error}</p>}
      {!isLoading && (
        <Table
          columns={USER_COLUMNS}
          rows={users}
          getRowKey={(row) => row.id}
          emptyMessage="No users found."
          renderRowActions={(row) => (
            <>
              <select
                aria-label={`Plan for ${row.email}`}
                value={row.plan}
                disabled={updatingId === row.id}
                onChange={(event) =>
                  void handlePlanChange(row, event.target.value as UserPlan)
                }
              >
                <option value="free">free</option>
                <option value="pro">pro</option>
              </select>
              <Button
                kind="danger"
                variant="table"
                text="Delete"
                ariaLabel={`Delete ${row.email}`}
                disabled={deletingId === row.id}
                onClick={() => setUserPendingDelete(row)}
              />
            </>
          )}
        />
      )}
      {!isLoading && (
        <section className={`admin-section ${styles.adminSectionHsk}`}>
          <h2 className={styles.adminSectionTitle}>HSK database</h2>
          <p className={styles.adminSectionDescription}>
            Fully reload the shared HSK words and characters tables from the
            upstream complete-hsk data. This is shared across every user.
          </p>
          <Button
            kind="danger"
            variant="page"
            text={isReloadingHsk ? "Reloading..." : "Reload HSK database"}
            icon={<SyncIcon />}
            disabled={isReloadingHsk}
            onClick={() => setIsReloadHskConfirmOpen(true)}
          />
        </section>
      )}
      {!isLoading && (
        <section className={`admin-section ${styles.adminSectionArticles}`}>
          <h2 className={styles.adminSectionTitle}>Weekly articles</h2>
          <p className={styles.adminSectionDescription}>
            Fetch the latest China-related news and have the AI pick the 3
            most important articles for this week.
          </p>
          <Button
            kind="confirm"
            variant="page"
            text={isGeneratingArticles ? "Refreshing..." : "Refresh articles"}
            icon={<SyncIcon />}
            disabled={isGeneratingArticles}
            onClick={() => void handleGenerateArticles()}
          />
        </section>
      )}
      <ConfirmModal
        isOpen={userPendingDelete !== null}
        message={`Are you sure you want to delete ${userPendingDelete?.email}? This will remove all their data and their account.`}
        danger={true}
        onCancel={() => setUserPendingDelete(null)}
        onConfirm={() => void handleConfirmDelete()}
      />
      <ConfirmModal
        isOpen={isReloadHskConfirmOpen}
        message="Are you sure you want to reload the HSK database? This clears and re-downloads the shared HSK words and characters tables."
        danger={true}
        onCancel={() => setIsReloadHskConfirmOpen(false)}
        onConfirm={() => void handleConfirmReloadHsk()}
      />
    </Page>
  );
}
