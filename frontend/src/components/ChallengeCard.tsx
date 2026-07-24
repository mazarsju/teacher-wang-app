import ChatCharacterAvatar from "./ChatCharacterAvatar";
import type { Challenge } from "../types/challenge";

type ChallengeCardProps = {
  challenge: Challenge;
  onSelect: (challenge: Challenge) => void;
};

export default function ChallengeCard({
  challenge,
  onSelect,
}: ChallengeCardProps) {
  const { character } = challenge;

  return (
    <button
      type="button"
      className="chat-character-card"
      onClick={() => onSelect(challenge)}
    >
      <ChatCharacterAvatar variant={character.avatarVariant} />
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
      </div>
    </button>
  );
}
