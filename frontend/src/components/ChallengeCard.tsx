import ChatCharacterAvatar from "./ChatCharacterAvatar";
import { TrophyIcon } from "./icons";
import type { Challenge } from "../types/challenge";
import chatCharacterCardStyles from "./ChatCharacterCard.module.css";
import styles from "./ChallengeCard.module.css";

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
          ? `${chatCharacterCardStyles.chatCharacterCard} ${styles.challengeCard} ${styles.challengeCardCompleted}`
          : `${chatCharacterCardStyles.chatCharacterCard} ${styles.challengeCard}`
      }
      onClick={() => onSelect(challenge)}
      aria-label={
        completed
          ? `${character.name} (${character.chineseName}), completed`
          : undefined
      }
    >
      <div className={styles.challengeCardAvatarWrap}>
        <ChatCharacterAvatar variant={character.avatarVariant} />
        {completed && (
          <span className={styles.challengeCardCompletedBadge} aria-hidden="true">
            <TrophyIcon className={styles.challengeCardCompletedIcon} />
          </span>
        )}
      </div>
      <div className={chatCharacterCardStyles.chatCharacterCardContent}>
        <span className={chatCharacterCardStyles.chatCharacterCardName}>
          {character.name}{" "}
          <span className={chatCharacterCardStyles.chatCharacterCardChineseName}>
            ({character.chineseName})
          </span>
        </span>
        <p className={chatCharacterCardStyles.chatCharacterCardDescription}>
          {challenge.description}
        </p>
        {completed && (
          <span className={styles.challengeCardCompletedLabel}>Completed</span>
        )}
      </div>
    </button>
  );
}
