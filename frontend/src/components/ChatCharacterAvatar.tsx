import teacherAvatar from "../assets/avatars/teacher.svg";
import friendAvatar from "../assets/avatars/friend.svg";
import waiterAvatar from "../assets/avatars/waiter.svg";
import shopAssistantAvatar from "../assets/avatars/shop-assistant.svg";

type ChatCharacterAvatarVariant =
  | "teacher"
  | "friend"
  | "waiter"
  | "shop-assistant";

type ChatCharacterAvatarProps = {
  variant: ChatCharacterAvatarVariant;
  className?: string;
};

const AVATAR_BY_VARIANT: Record<ChatCharacterAvatarVariant, string> = {
  teacher: teacherAvatar,
  friend: friendAvatar,
  waiter: waiterAvatar,
  "shop-assistant": shopAssistantAvatar,
};

export default function ChatCharacterAvatar({
  variant,
  className,
}: ChatCharacterAvatarProps) {
  const avatarClassName = ["chat-character-avatar-image", className]
    .filter(Boolean)
    .join(" ");

  return (
    <img
      className={avatarClassName}
      src={AVATAR_BY_VARIANT[variant]}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}
