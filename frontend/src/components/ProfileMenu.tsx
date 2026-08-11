import { useEffect, useId, useRef, useState } from "react";
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
        aria-label="Profile menu"
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
          aria-label="Profile"
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
            <span>{isSyncing ? "Syncing..." : "Synchro"}</span>
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
            <span>Log out</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
