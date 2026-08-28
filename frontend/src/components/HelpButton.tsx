import { useEffect, useId, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { HelpMarkIcon } from "./icons";
import styles from "./HelpButton.module.css";

const ISSUES_URL = "https://github.com/mazarsju/teacher-wang-app/issues";

export default function HelpButton() {
  const { t } = useTranslation("common");
  const [isOpen, setIsOpen] = useState(false);
  const bubbleId = useId();
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
    <div className={styles.helpButton} ref={rootRef}>
      {isOpen ? (
        <div id={bubbleId} className={styles.helpButtonBubble} role="dialog">
          <p>
            <Trans
              i18nKey="helpButton.bubble"
              t={t}
              components={{
                1: <a href={ISSUES_URL} target="_blank" rel="noreferrer" />,
              }}
            />
          </p>
        </div>
      ) : null}
      <button
        type="button"
        className={styles.helpButtonTrigger}
        aria-label={t("helpButton.triggerLabel")}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={bubbleId}
        onClick={() => setIsOpen((open) => !open)}
      >
        <HelpMarkIcon className={styles.helpButtonTriggerIcon} />
      </button>
    </div>
  );
}
