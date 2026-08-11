import Button from "./Button";
import styles from "./Banner.module.css";

type BannerProps = {
  type: "info" | "warning";
  message: string;
  buttonMessage: string;
  actionOnButtonClick: () => void;
  disabled?: boolean;
};

export default function Banner({
  type,
  message,
  buttonMessage,
  actionOnButtonClick,
  disabled,
}: BannerProps) {
  return (
    <div
      className={`${styles.appBanner} ${styles[`app-banner--${type}`] ?? ""}`}
      role="status"
    >
      <p className={styles.appBannerText}>{message}</p>
      <Button
        kind="confirm"
        variant="banner"
        text={buttonMessage}
        onClick={actionOnButtonClick}
        disabled={disabled}
      />
    </div>
  );
}
