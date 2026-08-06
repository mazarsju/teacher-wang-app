type BannerProps = {
  type: "info" | "warning";
  message: string;
  buttonMessage: string;
  actionOnButtonClick: () => void;
};

export default function Banner({
  type,
  message,
  buttonMessage,
  actionOnButtonClick,
}: BannerProps) {
  return (
    <div className={`app-banner app-banner--${type}`} role="status">
      <p className="app-banner-text">{message}</p>
      <button
        type="button"
        className="app-banner-button"
        onClick={actionOnButtonClick}
      >
        {buttonMessage}
      </button>
    </div>
  );
}
