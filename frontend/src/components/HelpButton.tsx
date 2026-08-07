import { useEffect, useId, useRef, useState } from "react";
import { HelpMarkIcon } from "./icons";

const ISSUES_URL = "https://github.com/mazarsju/teacher-wang-app/issues";

export default function HelpButton() {
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
    <div className="help-button" ref={rootRef}>
      {isOpen ? (
        <div id={bubbleId} className="help-button-bubble" role="dialog">
          <p>
            A question? A bug spotted? An idea of improvement? Don&apos;t
            hesitate to share your issue on{" "}
            <a href={ISSUES_URL} target="_blank" rel="noreferrer">
              Github
            </a>
            .
          </p>
        </div>
      ) : null}
      <button
        type="button"
        className="help-button-trigger"
        aria-label="Help"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={bubbleId}
        onClick={() => setIsOpen((open) => !open)}
      >
        <HelpMarkIcon className="help-button-trigger-icon" />
      </button>
    </div>
  );
}
