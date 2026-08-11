import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Semantic role — drives the color. */
export type ButtonKind = "cancel" | "confirm" | "danger";

/**
 * Where the button lives — drives sizing/backdrop, since the same kind
 * looks slightly different in a banner, a table row, a modal, the main
 * page, or as the validation button of a yes/no confirmation dialog.
 */
export type ButtonVariant = "page" | "modal" | "banner" | "table" | "confirmation";

type ButtonProps = {
  kind: ButtonKind;
  text: string;
  onClick?: () => void;
  variant?: ButtonVariant;
  /** HTML `type` attribute — "submit" for form-submitting buttons. */
  htmlType?: ButtonHTMLAttributes<HTMLButtonElement>["type"];
  disabled?: boolean;
  icon?: ReactNode;
  /** Escape hatch for the rare one-off visual tweak (e.g. a pill badge). */
  className?: string;
  ariaLabel?: string;
  title?: string;
};

export default function Button({
  kind,
  text,
  onClick,
  variant = "modal",
  htmlType = "button",
  disabled = false,
  icon,
  className,
  ariaLabel,
  title,
}: ButtonProps) {
  const classes = ["btn", `btn-${kind}`, `btn-${variant}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type={htmlType}
      className={classes}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
    >
      {icon}
      {text}
    </button>
  );
}
