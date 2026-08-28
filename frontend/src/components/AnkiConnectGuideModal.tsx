import { useTranslation } from "react-i18next";
import Button from "./Button";
import styles from "./AnkiConnectGuideModal.module.css";

type GuideStep = {
  id: string;
  title: string;
  description: string;
  imageSrc?: string;
  imageAlt?: string;
};

type AnkiConnectGuideModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export default function AnkiConnectGuideModal({
  isOpen,
  onClose,
}: AnkiConnectGuideModalProps) {
  const { t } = useTranslation("preferences");

  if (!isOpen) {
    return null;
  }

  const GUIDE_STEPS: GuideStep[] = [
    {
      id: "createAccount",
      title: t("ankiConnectGuideModal.steps.createAccount.title"),
      description: t("ankiConnectGuideModal.steps.createAccount.description"),
      imageSrc: "/anki-connect/01-create-account.png",
      imageAlt: t("ankiConnectGuideModal.steps.createAccount.imageAlt"),
    },
    {
      id: "installDesktop",
      title: t("ankiConnectGuideModal.steps.installDesktop.title"),
      description: t("ankiConnectGuideModal.steps.installDesktop.description"),
      imageSrc: "/anki-connect/02-install-desktop.png",
      imageAlt: t("ankiConnectGuideModal.steps.installDesktop.imageAlt"),
    },
    {
      id: "openAddons",
      title: t("ankiConnectGuideModal.steps.openAddons.title"),
      description: t("ankiConnectGuideModal.steps.openAddons.description"),
      imageSrc: "/anki-connect/03-open-addons.png",
      imageAlt: t("ankiConnectGuideModal.steps.openAddons.imageAlt"),
    },
    {
      id: "installAddon",
      title: t("ankiConnectGuideModal.steps.installAddon.title"),
      description: t("ankiConnectGuideModal.steps.installAddon.description"),
      imageSrc: "/anki-connect/04-install-addon.png",
      imageAlt: t("ankiConnectGuideModal.steps.installAddon.imageAlt"),
    },
    {
      id: "allowCors",
      title: t("ankiConnectGuideModal.steps.allowCors.title"),
      description: t("ankiConnectGuideModal.steps.allowCors.description"),
    },
    {
      id: "verify",
      title: t("ankiConnectGuideModal.steps.verify.title"),
      description: t("ankiConnectGuideModal.steps.verify.description"),
      imageSrc: "/anki-connect/05-verify-localhost.png",
      imageAlt: t("ankiConnectGuideModal.steps.verify.imageAlt"),
    },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal-dialog ${styles.ankiGuideModal}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="anki-connect-guide-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="anki-connect-guide-title" className="modal-title">
          {t("ankiConnectGuideModal.title")}
        </h2>
        <p className="modal-message">{t("ankiConnectGuideModal.description")}</p>

        <ol className={styles.ankiGuideSteps}>
          {GUIDE_STEPS.map((step, index) => (
            <li key={step.id} className={styles.ankiGuideStep}>
              <div className={styles.ankiGuideStepHeader}>
                <div>
                  <h3 className={styles.ankiGuideStepTitle}><span className={styles.ankiGuideStepNumber}>{index + 1}</span>&nbsp;{step.title}</h3>
                  <p className={styles.ankiGuideStepDescription}>
                    {step.description}
                  </p>
                </div>
              </div>
              {step.imageSrc && (
                <img
                  className={styles.ankiGuideStepImage}
                  src={step.imageSrc}
                  alt={step.imageAlt ?? ""}
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
              )}
            </li>
          ))}
        </ol>

        <div className="modal-actions">
          <Button
            kind="confirm"
            text={t("ankiConnectGuideModal.closeButton")}
            onClick={onClose}
          />
        </div>
      </div>
    </div>
  );
}
