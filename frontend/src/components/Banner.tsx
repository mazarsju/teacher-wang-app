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
      <button
        type="button"
        className={styles.appBannerButton}
        onClick={actionOnButtonClick}
        disabled={disabled}
      >
        {buttonMessage}
      </button>
    </div>
  );
}
