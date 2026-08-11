import teacherAvatar from "../assets/avatars/teacher.svg";
import friendAvatar from "../assets/avatars/friend.svg";
import waiterAvatar from "../assets/avatars/waiter.svg";
import taxiDriverAvatar from "../assets/avatars/taxi-driver.svg";
import hotelReceptionistAvatar from "../assets/avatars/hotel-receptionist.svg";
import shopAssistantAvatar from "../assets/avatars/shop-assistant.svg";
import styles from "./ChatCharacterCard.module.css";

type ChatCharacterAvatarVariant =
  | "teacher"
  | "friend"
  | "waiter"
  | "taxi-driver"
  | "hotel-receptionist"
  | "shop-assistant";

type ChatCharacterAvatarProps = {
  variant: ChatCharacterAvatarVariant;
  className?: string;
};

const AVATAR_BY_VARIANT: Record<ChatCharacterAvatarVariant, string> = {
  teacher: teacherAvatar,
  friend: friendAvatar,
  waiter: waiterAvatar,
  "taxi-driver": taxiDriverAvatar,
  "hotel-receptionist": hotelReceptionistAvatar,
  "shop-assistant": shopAssistantAvatar,
};

export default function ChatCharacterAvatar({
  variant,
  className,
}: ChatCharacterAvatarProps) {
  const avatarClassName = [styles.chatCharacterAvatarImage, className]
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
