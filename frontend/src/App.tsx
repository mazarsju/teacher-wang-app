import { useEffect, useState, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import "./styles/tokens.css";
import "./styles/globals.css";
import "./components/shared.css";
import styles from "./App.module.css";
import ConfirmModal from "./components/ConfirmModal";
import HelpButton from "./components/HelpButton";
import Navbar, { type PageId } from "./components/Navbar";
import AdminPage from "./pages/AdminPage";
import ChatPage from "./pages/ChatPage";
import GrammarPage from "./pages/GrammarPage";
import HomePage from "./pages/HomePage";
import KnowledgeBasePage from "./pages/KnowledgeBasePage";
import PreferencesPage from "./pages/PreferencesPage";
import WelcomeAuthPage from "./pages/WelcomeAuthPage";
import { useAppDispatch, useAppSelector } from "./store/hooks";
import { resetAppData, syncAppData } from "./store/thunks/syncAppData";
import { onUnauthorizedSession } from "./utils/auth/apiFetch";
import { fetchCurrentUser } from "./utils/auth/meApi";
import {
  clearCognitoTokens,
  hasStoredSession,
} from "./utils/auth/tokenStorage";

type PageProps = { onNavigate?: (page: PageId) => void };

const PAGES: Record<PageId, ComponentType<PageProps>> = {
  home: HomePage,
  "knowledge-base": KnowledgeBasePage,
  grammar: GrammarPage,
  chat: ChatPage,
  preferences: PreferencesPage,
  admin: AdminPage,
};

export default function App() {
  const { t } = useTranslation("common");
  const dispatch = useAppDispatch();
  const syncStatus = useAppSelector((state) => state.sync.status);
  const [isAuthenticated, setIsAuthenticated] = useState(() =>
    hasStoredSession(),
  );
  const [activePage, setActivePage] = useState<PageId>("home");
  const [isAdmin, setIsAdmin] = useState(false);
  const [pendingPage, setPendingPage] = useState<PageId | null>(null);
  const quizInProgress = useAppSelector((state) => state.grammar.quizInProgress);
  const ActivePage = PAGES[activePage];

  function handlePageChange(page: PageId) {
    if (activePage === "grammar" && quizInProgress && page !== "grammar") {
      setPendingPage(page);
      return;
    }
    setActivePage(page);
  }

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    void dispatch(syncAppData());
    fetchCurrentUser()
      .then((user) => setIsAdmin(user.is_admin))
      .catch(() => setIsAdmin(false));
  }, [dispatch, isAuthenticated]);

  useEffect(() => {
    return onUnauthorizedSession(() => {
      dispatch(resetAppData());
      setActivePage("home");
      setIsAuthenticated(false);
    });
  }, [dispatch]);

  function handleLogout() {
    clearCognitoTokens();
    dispatch(resetAppData());
    setActivePage("home");
    setIsAuthenticated(false);
    setIsAdmin(false);
  }

  function handleSync() {
    void dispatch(syncAppData());
  }

  if (!isAuthenticated) {
    return (
      <WelcomeAuthPage onAuthenticated={() => setIsAuthenticated(true)} />
    );
  }

  return (
    <div className={styles.app}>
      <Navbar
        activePage={activePage}
        onPageChange={handlePageChange}
        onLogout={handleLogout}
        onSync={handleSync}
        isSyncing={syncStatus === "loading"}
        isAdmin={isAdmin}
      />
      <main className={styles.appMain}>
        <ActivePage onNavigate={handlePageChange} />
      </main>
      <HelpButton />
      <ConfirmModal
        isOpen={pendingPage !== null}
        message={t("app.leaveQuizConfirm")}
        onConfirm={() => {
          if (pendingPage) {
            setActivePage(pendingPage);
          }
          setPendingPage(null);
        }}
        onCancel={() => setPendingPage(null)}
      />
    </div>
  );
}
