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
import {
  clearCognitoTokens,
  hasStoredSession,
} from "./utils/auth/tokenStorage";

const PAGES: Record<PageId, ComponentType> = {
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
        <ActivePage />
      </main>
    </div>
  );
}
