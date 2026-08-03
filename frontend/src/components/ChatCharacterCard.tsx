import ChatCharacterAvatar from "./ChatCharacterAvatar";

export type ChatCharacter = {
  id: string;
  name: string;
  chineseName: string;
  description: string;
  avatarVariant: "teacher" | "friend" | "waiter" | "shop-assistant";
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
      className="chat-character-card"
      onClick={() => onSelect(character)}
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
          {character.description}
        </p>
      </div>
    </button>
  );
}
