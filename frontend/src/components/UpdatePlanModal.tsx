import { Trans, useTranslation } from "react-i18next";
import Button from "./Button";

const ISSUES_URL = "https://github.com/mazarsju/teacher-wang-app/issues";

type UpdatePlanModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export default function UpdatePlanModal({ isOpen, onClose }: UpdatePlanModalProps) {
  const { t } = useTranslation(["preferences", "common"]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-overlay modal-overlay--stacked" onClick={onClose}>
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-plan-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="update-plan-modal-title" className="modal-title">
          {t("updatePlanModal.title")}
        </h2>
        <p className="modal-message">
          <Trans
            i18nKey="updatePlanModal.message"
            t={t}
            components={{
              1: <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer" />,
            }}
          />
        </p>
        <div className="modal-actions">
          <Button kind="confirm" text={t("common:actions.close")} onClick={onClose} />
        </div>
      </div>
    </div>
  );
}
