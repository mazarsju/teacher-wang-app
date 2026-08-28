import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PowerIcon, ProfileIcon, SyncIcon } from "./icons";
import styles from "./ProfileMenu.module.css";

type ProfileMenuProps = {
  onLogout: () => void;
  onSync: () => void;
  isSyncing?: boolean;
};

export default function ProfileMenu({
  onLogout,
  onSync,
  isSyncing = false,
}: ProfileMenuProps) {
  const { t } = useTranslation("common");
  const [isOpen, setIsOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (
        rootRef.current !== null &&
        !rootRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  return (
    <div className={styles.profileMenu} ref={rootRef}>
      <button
        type="button"
        className={styles.profileMenuTrigger}
        aria-label={t("profileMenu.triggerLabel")}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={() => setIsOpen((open) => !open)}
      >
        <ProfileIcon className={styles.profileMenuTriggerIcon} />
      </button>

      {isOpen ? (
        <div
          id={menuId}
          className={styles.profileMenuDropdown}
          role="menu"
          aria-label={t("profileMenu.menuLabel")}
        >
          <button
            type="button"
            className={styles.profileMenuItem}
            role="menuitem"
            disabled={isSyncing}
            onClick={() => {
              onSync();
            }}
          >
            <SyncIcon className={styles.profileMenuItemIcon} />
            <span>
              {isSyncing ? t("profileMenu.syncing") : t("profileMenu.synchro")}
            </span>
          </button>
          <button
            type="button"
            className={styles.profileMenuItem}
            role="menuitem"
            onClick={() => {
              setIsOpen(false);
              onLogout();
            }}
          >
            <PowerIcon className={styles.profileMenuItemIcon} />
            <span>{t("profileMenu.logOut")}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
