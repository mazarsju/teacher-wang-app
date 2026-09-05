import ChatCharacterAvatar from "./ChatCharacterAvatar";
import styles from "./ChatCharacterCard.module.css";

export type ChatCharacter = {
  id: string;
  name: string;
  chineseName: string;
  description: string;
  avatarVariant:
    | "teacher"
    | "friend"
    | "waiter"
    | "taxi-driver"
    | "hotel-receptionist"
    | "shop-assistant"
    | "passerby"
    | "ticket-seller"
    | "doctor"
    | "interviewer"
    | "librarian"
    | "bus-driver"
    | "hairdresser"
    | "landlord";
};

type ChatCharacterCardProps = {
  character: ChatCharacter;
  onSelect: (character: ChatCharacter) => void;
};

export default function ChatCharacterCard({
  character,
  onSelect,
}: ChatCharacterCardProps) {
  return (
    <button
      type="button"
      className={styles.chatCharacterCard}
      onClick={() => onSelect(character)}
    >
      <ChatCharacterAvatar variant={character.avatarVariant} />
      <div className={styles.chatCharacterCardContent}>
        <span className={styles.chatCharacterCardName}>
          {character.name}{" "}
          <span className={styles.chatCharacterCardChineseName}>
            ({character.chineseName})
          </span>
        </span>
        <p className={styles.chatCharacterCardDescription}>
          {character.description}
        </p>
      </div>
    </button>
  );
}
