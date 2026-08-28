import { useTranslation } from "react-i18next";
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
  labelKey: string;
  icon: typeof HouseIcon;
};

const NAV_ITEMS: NavItem[] = [
  { id: "home", labelKey: "navbar.nav.home", icon: HouseIcon },
  { id: "knowledge-base", labelKey: "navbar.nav.knowledgeBase", icon: NotebookIcon },
  { id: "grammar", labelKey: "navbar.nav.grammar", icon: BookOpenIcon },
  { id: "chat", labelKey: "navbar.nav.chat", icon: ChatBubbleIcon },
  { id: "preferences", labelKey: "navbar.nav.preferences", icon: SettingsIcon },
];

const ADMIN_NAV_ITEM: NavItem = {
  id: "admin",
  labelKey: "navbar.nav.admin",
  icon: ProfileIcon,
};

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
  const { t } = useTranslation("common");
  const navItems = isAdmin ? [...NAV_ITEMS, ADMIN_NAV_ITEM] : NAV_ITEMS;
  return (
    <nav className={styles.navbar} aria-label={t("navbar.mainNavigation")}>
      <div className={styles.navbarInner}>
        <div className={styles.navbarNavGroup}>
          <div className={styles.navbarBrand}>
            <img className={styles.navbarBrandLogo} src={logo} alt="" />
            <span className="navbar-brand-text">{t("navbar.brand")}</span>
          </div>
          <ul className={styles.navbarList}>
            {navItems.map(({ id, labelKey, icon: Icon }) => {
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
                    <span>{t(labelKey)}</span>
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
