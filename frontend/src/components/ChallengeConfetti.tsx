import { useMemo } from "react";
import { createPortal } from "react-dom";

const CONFETTI_COLORS = [
  "#22c55e",
  "#16a34a",
  "#86efac",
  "#fbbf24",
  "#f97316",
  "#38bdf8",
  "#a78bfa",
  "#fb7185",
];

type ChallengeConfettiProps = {
  active: boolean;
};

export default function ChallengeConfetti({ active }: ChallengeConfettiProps) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 72 }, (_, index) => ({
        id: index,
        left: `${(index * 11 + 3) % 100}%`,
        delay: `${(index % 14) * 0.04}s`,
        duration: `${1.4 + (index % 7) * 0.08}s`,
        drift: `${((index % 9) - 4) * 28}px`,
        color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
        size: `${7 + (index % 5)}px`,
        rotation: `${(index * 47) % 360}deg`,
      })),
    [],
  );

  if (!active || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="chat-modal-confetti" aria-hidden="true">
      {pieces.map((piece) => (
        <span
          key={piece.id}
          className="chat-modal-confetti-piece"
          style={{
            left: piece.left,
            backgroundColor: piece.color,
            width: piece.size,
            height: piece.size,
            animationDelay: piece.delay,
            animationDuration: piece.duration,
            ["--confetti-drift" as string]: piece.drift,
            ["--confetti-rotation" as string]: piece.rotation,
          }}
        />
      ))}
    </div>,
    document.body,
  );
}
