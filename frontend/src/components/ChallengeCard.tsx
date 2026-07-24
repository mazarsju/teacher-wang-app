import ChatCharacterAvatar from "./ChatCharacterAvatar";
import { TrophyIcon } from "./icons";
import type { Challenge } from "../types/challenge";

type ChallengeCardProps = {
  challenge: Challenge;
  completed?: boolean;
  onSelect: (challenge: Challenge) => void;
};

export default function ChallengeCard({
  challenge,
  completed = false,
  onSelect,
}: ChallengeCardProps) {
  const { character } = challenge;

  return (
    <button
      type="button"
      className={
        completed
          ? "chat-character-card challenge-card challenge-card--completed"
          : "chat-character-card challenge-card"
      }
      onClick={() => onSelect(challenge)}
      aria-label={
        completed
          ? `${character.name} (${character.chineseName}), completed`
          : undefined
      }
    >
      <div className="challenge-card-avatar-wrap">
        <ChatCharacterAvatar variant={character.avatarVariant} />
        {completed && (
          <span className="challenge-card-completed-badge" aria-hidden="true">
            <TrophyIcon className="challenge-card-completed-icon" />
          </span>
        )}
      </div>
      <div className="chat-character-card-content">
        <span className="chat-character-card-name">
          {character.name}{" "}
          <span className="chat-character-card-chinese-name">
            ({character.chineseName})
          </span>
        </span>
        <p className="chat-character-card-description">
          {challenge.description}
        </p>
        {completed && (
          <span className="challenge-card-completed-label">Completed</span>
        )}
      </div>
    </button>
  );
}
