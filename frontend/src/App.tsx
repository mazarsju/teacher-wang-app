import { useEffect, useState, type ComponentType } from "react";
import "./App.css";
import Navbar, { type PageId } from "./components/Navbar";
import ChatPage from "./pages/ChatPage";
import HomePage from "./pages/HomePage";
import KnowledgeBasePage from "./pages/KnowledgeBasePage";
import PreferencesPage from "./pages/PreferencesPage";
import WelcomeAuthPage from "./pages/WelcomeAuthPage";
import { useAppDispatch, useAppSelector } from "./store/hooks";
import { resetAppData, syncAppData } from "./store/thunks/syncAppData";
import { onUnauthorizedSession } from "./utils/auth/apiFetch";
import {
  clearCognitoTokens,
  hasStoredSession,
} from "./utils/auth/tokenStorage";

type PageProps = { onNavigate?: (page: PageId) => void };

const PAGES: Record<PageId, ComponentType<PageProps>> = {
  home: HomePage,
  "knowledge-base": KnowledgeBasePage,
  chat: ChatPage,
  preferences: PreferencesPage,
};

export default function App() {
  const dispatch = useAppDispatch();
  const syncStatus = useAppSelector((state) => state.sync.status);
  const [isAuthenticated, setIsAuthenticated] = useState(() =>
    hasStoredSession(),
  );
  const [activePage, setActivePage] = useState<PageId>("home");
  const ActivePage = PAGES[activePage];

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    void dispatch(syncAppData());
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
    <div className="app">
      <Navbar
        activePage={activePage}
        onPageChange={setActivePage}
        onLogout={handleLogout}
        onSync={handleSync}
        isSyncing={syncStatus === "loading"}
      />
      <main className="app-main">
        <ActivePage onNavigate={setActivePage} />
      </main>
    </div>
  );
}
