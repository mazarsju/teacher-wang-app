import {
  ChatBubbleIcon,
  HouseIcon,
  NotebookIcon,
  ProfileIcon,
  SettingsIcon,
} from "./icons";
import ProfileMenu from "./ProfileMenu";
import logo from "../assets/logo.png";

export type PageId =
  | "home"
  | "knowledge-base"
  | "chat"
  | "preferences"
  | "admin";

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

const ADMIN_NAV_ITEM: NavItem = { id: "admin", label: "Admin", icon: ProfileIcon };

type NavbarProps = {
  activePage: PageId;
  onPageChange: (page: PageId) => void;
  onLogout: () => void;
  onSync: () => void;
  isSyncing?: boolean;
  isAdmin?: boolean;
};

export default function Navbar({
  activePage,
  onPageChange,
  onLogout,
  onSync,
  isSyncing = false,
  isAdmin = false,
}: NavbarProps) {
  const navItems = isAdmin ? [...NAV_ITEMS, ADMIN_NAV_ITEM] : NAV_ITEMS;
  return (
    <nav className="navbar" aria-label="Main navigation">
      <div className="navbar-inner">
        <div className="navbar-nav-group">
          <div className="navbar-brand">
            <img className="navbar-brand-logo" src={logo} alt="" />
            <span className="navbar-brand-text">Teacher Wang</span>
          </div>
          <ul className="navbar-list">
            {navItems.map(({ id, label, icon: Icon }) => {
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
