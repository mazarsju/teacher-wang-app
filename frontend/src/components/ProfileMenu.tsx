import { useEffect, useId, useRef, useState } from "react";
import { PowerIcon, ProfileIcon, SyncIcon } from "./icons";

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
    <div className="profile-menu" ref={rootRef}>
      <button
        type="button"
        className="profile-menu-trigger"
        aria-label="Profile menu"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={() => setIsOpen((open) => !open)}
      >
        <ProfileIcon className="profile-menu-trigger-icon" />
      </button>

      {isOpen ? (
        <div
          id={menuId}
          className="profile-menu-dropdown"
          role="menu"
          aria-label="Profile"
        >
          <button
            type="button"
            className="profile-menu-item"
            role="menuitem"
            disabled={isSyncing}
            onClick={() => {
              onSync();
            }}
          >
            <SyncIcon className="profile-menu-item-icon" />
            <span>{isSyncing ? "Syncing..." : "Synchro"}</span>
          </button>
          <button
            type="button"
            className="profile-menu-item"
            role="menuitem"
            onClick={() => {
              setIsOpen(false);
              onLogout();
            }}
          >
            <PowerIcon className="profile-menu-item-icon" />
            <span>Log out</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
