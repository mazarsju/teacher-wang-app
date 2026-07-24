type ChatCharacterAvatarProps = {
  variant: "teacher" | "friend" | "waiter";
  className?: string;
};

export default function ChatCharacterAvatar({
  variant,
  className,
}: ChatCharacterAvatarProps) {
  const avatarClassName = ["chat-character-avatar-image", className]
    .filter(Boolean)
    .join(" ");

  if (variant === "teacher") {
    return (
      <svg
        className={avatarClassName}
        viewBox="0 0 96 96"
        role="img"
        aria-hidden="true"
      >
        <rect width="96" height="96" rx="48" fill="#dbeafe" />
        <circle cx="48" cy="40" r="18" fill="#fcd9b6" />
        <path
          d="M20 82c4-16 18-24 28-24s24 8 28 24"
          fill="#1e3a8a"
        />
        <circle cx="41" cy="38" r="2.5" fill="#1f2937" />
        <circle cx="55" cy="38" r="2.5" fill="#1f2937" />
        <path
          d="M42 47c3 3 9 3 12 0"
          stroke="#9a3412"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
        <rect x="30" y="33" width="36" height="10" rx="5" fill="none" stroke="#374151" strokeWidth="2" />
        <path d="M34 36h28" stroke="#374151" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (variant === "waiter") {
    return (
      <svg
        className={avatarClassName}
        viewBox="0 0 96 96"
        role="img"
        aria-hidden="true"
      >
        <rect width="96" height="96" rx="48" fill="#ffedd5" />
        <circle cx="48" cy="40" r="18" fill="#fcd9b6" />
        <path
          d="M20 84c5-18 18-26 28-26s23 8 28 26"
          fill="#1f2937"
        />
        <rect x="34" y="58" width="28" height="10" rx="2" fill="#f8fafc" />
        <circle cx="41" cy="39" r="2.5" fill="#1f2937" />
        <circle cx="55" cy="39" r="2.5" fill="#1f2937" />
        <path
          d="M41 48c3 2.5 11 2.5 14 0"
          stroke="#9a3412"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
        <ellipse cx="48" cy="24" rx="16" ry="5" fill="#111827" />
        <rect x="40" y="18" width="16" height="8" rx="2" fill="#111827" />
      </svg>
    );
  }

  return (
    <svg
      className={avatarClassName}
      viewBox="0 0 96 96"
      role="img"
      aria-hidden="true"
    >
      <rect width="96" height="96" rx="48" fill="#dcfce7" />
      <circle cx="48" cy="40" r="18" fill="#fcd9b6" />
      <path
        d="M18 84c6-18 20-26 30-26s24 8 30 26"
        fill="#16a34a"
      />
      <circle cx="41" cy="39" r="2.5" fill="#1f2937" />
      <circle cx="55" cy="39" r="2.5" fill="#1f2937" />
      <path
        d="M40 47c4 4 12 4 16 0"
        stroke="#9a3412"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M30 30c4-6 10-8 18-8s14 2 18 8"
        stroke="#374151"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
