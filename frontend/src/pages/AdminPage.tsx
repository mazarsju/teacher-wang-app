import { useCallback, useEffect, useState } from "react";
import ConfirmModal from "../components/ConfirmModal";
import Page from "../components/Page";
import Table, { type TableColumn } from "../components/Table";
import type { AdminUser, UserPlan } from "../types/adminUser";
import { deleteUser, fetchUsers, updateUserPlan } from "../utils/admin/adminApi";

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
              <button
                type="button"
                className="button--danger"
                aria-label={`Delete ${row.email}`}
                disabled={deletingId === row.id}
                onClick={() => setUserPendingDelete(row)}
              >
                Delete
              </button>
            </>
          )}
        />
      )}
      <ConfirmModal
        isOpen={userPendingDelete !== null}
        message={`Are you sure you want to delete ${userPendingDelete?.email}? This will remove all their data and their account.`}
        danger={true}
        onCancel={() => setUserPendingDelete(null)}
        onConfirm={() => void handleConfirmDelete()}
      />
    </Page>
  );
}
