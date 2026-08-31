import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Button from "../components/Button";
import ConfirmModal from "../components/ConfirmModal";
import { SyncIcon } from "../components/icons";
import LoadHskTranslationModal, {
  type HskTranslationFormValues,
} from "../components/LoadHskTranslationModal";
import Page from "../components/Page";
import Table, { type TableColumn } from "../components/Table";
import type { AdminUser, UserPlan } from "../types/adminUser";
import {
  deleteUser,
  fetchUsers,
  generateArticles,
  reloadGrammarRules,
  reloadHskContent,
  updateUserPlan,
  uploadHskTranslation,
} from "../utils/admin/adminApi";
import styles from "./AdminPage.module.css";

export default function AdminPage() {
  const { t } = useTranslation("admin");
  const userColumns: TableColumn<AdminUser>[] = useMemo(
    () => [
      { key: "email", header: t("adminPage.table.emailHeader") },
      { key: "plan", header: t("adminPage.table.planHeader") },
      {
        key: "last_connection",
        header: t("adminPage.table.lastConnectionHeader"),
        render: (row) => new Date(row.last_connection).toLocaleString(),
      },
    ],
    [t],
  );
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
  const [isReloadingGrammar, setIsReloadingGrammar] = useState(false);
  const [isLoadTranslationModalOpen, setIsLoadTranslationModalOpen] =
    useState(false);
  const [isLoadingTranslation, setIsLoadingTranslation] = useState(false);

  const loadUsers = useCallback(async () => {
    setError(null);
    try {
      setUsers(await fetchUsers());
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : t("adminPage.errors.loadUsers"),
      );
    } finally {
      setIsLoading(false);
    }
  }, [t]);

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
          : t("adminPage.errors.updateUser"),
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
          : t("adminPage.errors.deleteUser"),
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
          : t("adminPage.errors.reloadHsk"),
      );
    } finally {
      setIsReloadingHsk(false);
    }
  }

  async function handleConfirmLoadTranslation(values: HskTranslationFormValues) {
    setIsLoadTranslationModalOpen(false);
    setIsLoadingTranslation(true);
    setError(null);
    try {
      await uploadHskTranslation(values.file, values.language);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : t("adminPage.errors.loadTranslation"),
      );
    } finally {
      setIsLoadingTranslation(false);
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
          : t("adminPage.errors.refreshArticles"),
      );
    } finally {
      setIsGeneratingArticles(false);
    }
  }

  async function handleReloadGrammar() {
    setIsReloadingGrammar(true);
    setError(null);
    try {
      await reloadGrammarRules();
    } catch (reloadError) {
      setError(
        reloadError instanceof Error
          ? reloadError.message
          : t("adminPage.errors.reloadGrammar"),
      );
    } finally {
      setIsReloadingGrammar(false);
    }
  }

  return (
    <Page title={t("adminPage.title")}>
      {isLoading && <p>{t("adminPage.loadingUsers")}</p>}
      {error && <p className="table-error">{error}</p>}
      {!isLoading && (
        <Table
          columns={userColumns}
          rows={users}
          getRowKey={(row) => row.id}
          emptyMessage={t("adminPage.table.emptyMessage")}
          renderRowActions={(row) => (
            <>
              <select
                aria-label={t("adminPage.table.planAriaLabel", { email: row.email })}
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
                text={t("adminPage.table.deleteButton")}
                ariaLabel={t("adminPage.table.deleteAriaLabel", { email: row.email })}
                disabled={deletingId === row.id}
                onClick={() => setUserPendingDelete(row)}
              />
            </>
          )}
        />
      )}
      {!isLoading && (
        <section className={`admin-section ${styles.adminSectionHsk}`}>
          <h2 className={styles.adminSectionTitle}>{t("adminPage.hskSection.title")}</h2>
          <p className={styles.adminSectionDescription}>
            {t("adminPage.hskSection.description")}
          </p>
          <div className={styles.adminSectionActions}>
            <Button
              kind="danger"
              variant="page"
              text={
                isReloadingHsk
                  ? t("adminPage.hskSection.reloadingButton")
                  : t("adminPage.hskSection.reloadButton")
              }
              icon={<SyncIcon />}
              disabled={isReloadingHsk}
              onClick={() => setIsReloadHskConfirmOpen(true)}
            />
            <Button
              kind="cancel"
              variant="page"
              text={
                isLoadingTranslation
                  ? t("adminPage.hskSection.loadingTranslationButton")
                  : t("adminPage.hskSection.loadTranslationButton")
              }
              disabled={isLoadingTranslation}
              onClick={() => setIsLoadTranslationModalOpen(true)}
            />
          </div>
        </section>
      )}
      {!isLoading && (
        <section className={`admin-section ${styles.adminSectionArticles}`}>
          <h2 className={styles.adminSectionTitle}>{t("adminPage.articlesSection.title")}</h2>
          <p className={styles.adminSectionDescription}>
            {t("adminPage.articlesSection.description")}
          </p>
          <Button
            kind="confirm"
            variant="page"
            text={
              isGeneratingArticles
                ? t("adminPage.articlesSection.refreshingButton")
                : t("adminPage.articlesSection.refreshButton")
            }
            icon={<SyncIcon />}
            disabled={isGeneratingArticles}
            onClick={() => void handleGenerateArticles()}
          />
        </section>
      )}
      {!isLoading && (
        <section className={`admin-section ${styles.adminSectionGrammar}`}>
          <h2 className={styles.adminSectionTitle}>{t("adminPage.grammarSection.title")}</h2>
          <p className={styles.adminSectionDescription}>
            {t("adminPage.grammarSection.description")}
          </p>
          <Button
            kind="confirm"
            variant="page"
            text={
              isReloadingGrammar
                ? t("adminPage.grammarSection.reloadingButton")
                : t("adminPage.grammarSection.reloadButton")
            }
            icon={<SyncIcon />}
            disabled={isReloadingGrammar}
            onClick={() => void handleReloadGrammar()}
          />
        </section>
      )}
      <ConfirmModal
        isOpen={userPendingDelete !== null}
        message={t("adminPage.deleteConfirm.message", {
          email: userPendingDelete?.email,
        })}
        danger={true}
        onCancel={() => setUserPendingDelete(null)}
        onConfirm={() => void handleConfirmDelete()}
      />
      <ConfirmModal
        isOpen={isReloadHskConfirmOpen}
        message={t("adminPage.reloadHskConfirm.message")}
        danger={true}
        onCancel={() => setIsReloadHskConfirmOpen(false)}
        onConfirm={() => void handleConfirmReloadHsk()}
      />
      <LoadHskTranslationModal
        isOpen={isLoadTranslationModalOpen}
        onCancel={() => setIsLoadTranslationModalOpen(false)}
        onConfirm={(values) => void handleConfirmLoadTranslation(values)}
      />
    </Page>
  );
}
