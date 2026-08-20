import {
  BookOpenIcon,
  ChatBubbleIcon,
  HouseIcon,
  NotebookIcon,
  ProfileIcon,
  SettingsIcon,
} from "./icons";
import ProfileMenu from "./ProfileMenu";
import logo from "../assets/logo.png";
import styles from "./Navbar.module.css";

export type PageId =
  | "home"
  | "knowledge-base"
  | "grammar"
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
  { id: "grammar", label: "Grammar", icon: BookOpenIcon },
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
    <nav className={styles.navbar} aria-label="Main navigation">
      <div className={styles.navbarInner}>
        <div className={styles.navbarNavGroup}>
          <div className={styles.navbarBrand}>
            <img className={styles.navbarBrandLogo} src={logo} alt="" />
            <span className="navbar-brand-text">Teacher Wang</span>
          </div>
          <ul className={styles.navbarList}>
            {navItems.map(({ id, label, icon: Icon }) => {
              const isActive = activePage === id;

              return (
                <li key={id}>
                  <button
                    type="button"
                    className={`${styles.navbarTab}${isActive ? ` ${styles.navbarTabActive}` : ""}`}
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => onPageChange(id)}
                  >
                    <Icon className={styles.navbarIcon} />
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
