import {
  ChatBubbleIcon,
  HouseIcon,
  NotebookIcon,
  SettingsIcon,
} from "./icons";
import ProfileMenu from "./ProfileMenu";

export type PageId = "home" | "knowledge-base" | "chat" | "preferences";

type NavItem = {
  id: PageId;
  label: string;
  icon: typeof HouseIcon;
};

const NAV_ITEMS: NavItem[] = [
  { id: "home", label: "Home", icon: HouseIcon },
  { id: "knowledge-base", label: "Knowledge base", icon: NotebookIcon },
  { id: "chat", label: "Chat", icon: ChatBubbleIcon },
  { id: "preferences", label: "Preferences", icon: SettingsIcon },
];

type NavbarProps = {
  activePage: PageId;
  onPageChange: (page: PageId) => void;
  onLogout: () => void;
  onSync: () => void;
  isSyncing?: boolean;
};

export default function Navbar({
  activePage,
  onPageChange,
  onLogout,
  onSync,
  isSyncing = false,
}: NavbarProps) {
  return (
    <nav className="navbar" aria-label="Main navigation">
      <div className="navbar-inner">
        <div className="navbar-nav-group">
          <div className="navbar-brand">
            <span className="navbar-brand-glyph">学</span>
            <span className="navbar-brand-text">Teacher Wang</span>
          </div>
          <ul className="navbar-list">
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
              const isActive = activePage === id;

              return (
                <li key={id}>
                  <button
                    type="button"
                    className={`navbar-tab${isActive ? " navbar-tab--active" : ""}`}
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => onPageChange(id)}
                  >
                    <Icon className="navbar-icon" />
                    <span>{label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <ProfileMenu
          onLogout={onLogout}
          onSync={onSync}
          isSyncing={isSyncing}
        />
      </div>
    </nav>
  );
}
