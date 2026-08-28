import { useTranslation } from "react-i18next";
import {
  CheckIcon,
  HourglassIcon,
  IncorrectIcon,
  WarningIcon,
} from "../components/icons";
import type { UserPlan } from "../types/adminUser";
import Button from "./Button";
import styles from "./ChangePlanModal.module.css";

type ChangePlanModalProps = {
  isOpen: boolean;
  currentPlan: UserPlan;
  onClose: () => void;
  onSwitchPlan: () => void;
};

type FeatureIconKind = "check" | "warning" | "cross" | "hourglass";

const FEATURE_ICONS: Record<FeatureIconKind, typeof CheckIcon> = {
  check: CheckIcon,
  warning: WarningIcon,
  cross: IncorrectIcon,
  hourglass: HourglassIcon,
};

type FeatureCell = { text: string; icon: FeatureIconKind };

export default function ChangePlanModal({
  isOpen,
  currentPlan,
  onClose,
  onSwitchPlan,
}: ChangePlanModalProps) {
  const { t } = useTranslation(["preferences", "common"]);

  if (!isOpen) {
    return null;
  }

  const PLANS: Array<{ id: UserPlan; name: string; price: string }> = [
    {
      id: "free",
      name: t("changePlanModal.plans.free.name"),
      price: t("changePlanModal.plans.free.price"),
    },
    {
      id: "pro",
      name: t("changePlanModal.plans.pro.name"),
      price: t("changePlanModal.plans.pro.price"),
    },
  ];

  const PLAN_FEATURES: Array<{
    label: string;
    free: FeatureCell;
    pro: FeatureCell;
  }> = [
    {
      label: t("changePlanModal.features.knowledgeBase.label"),
      free: { text: t("changePlanModal.features.knowledgeBase.free"), icon: "check" },
      pro: { text: t("changePlanModal.features.knowledgeBase.pro"), icon: "check" },
    },
    {
      label: t("changePlanModal.features.anki.label"),
      free: { text: t("changePlanModal.features.anki.free"), icon: "check" },
      pro: { text: t("changePlanModal.features.anki.pro"), icon: "check" },
    },
    {
      label: t("changePlanModal.features.aiChat.label"),
      free: { text: t("changePlanModal.features.aiChat.free"), icon: "warning" },
      pro: { text: t("changePlanModal.features.aiChat.pro"), icon: "check" },
    },
    {
      label: t("changePlanModal.features.grammar.label"),
      free: { text: t("changePlanModal.features.grammar.free"), icon: "warning" },
      pro: { text: t("changePlanModal.features.grammar.pro"), icon: "check" },
    },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-dialog modal-dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-plan-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="change-plan-modal-title" className="modal-title">
          {t("changePlanModal.title")}
        </h2>

        <div className={styles.planComparison}>
          {PLANS.map((plan) => {
            const isCurrent = plan.id === currentPlan;
            return (
              <div
                key={plan.id}
                className={`${styles.planCard}${isCurrent ? ` ${styles.planCardCurrent}` : ""}`}
              >
                <div className={styles.planCardHeader}>
                  <h3 className={styles.planCardName}>{plan.name}</h3>
                  <p className={styles.planCardPrice}>{plan.price}</p>
                  <div className={styles.planCardCta}>
                    {isCurrent ? (
                      <span className={styles.planCardCurrentLabel}>
                        {t("changePlanModal.currentPlanLabel")}
                      </span>
                    ) : (
                      <Button
                        kind="confirm"
                        text={t("changePlanModal.switchTo", { plan: plan.name })}
                        onClick={onSwitchPlan}
                      />
                    )}
                  </div>
                </div>
                <ul className={styles.planCardFeatures}>
                  {PLAN_FEATURES.map((feature) => {
                    const cell = plan.id === "free" ? feature.free : feature.pro;
                    const Icon = FEATURE_ICONS[cell.icon];
                    return (
                      <li key={feature.label}>
                        <span className={styles.planCardFeatureLabel}>
                          {feature.label}
                        </span>
                        <span className={styles.planCardFeatureValue}>
                          <Icon
                            className={`${styles.planFeatureIcon} ${styles[`plan-feature-icon--${cell.icon}`]}`}
                          />
                          {cell.text}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>

        <div className="modal-actions">
          <Button kind="cancel" text={t("common:actions.close")} onClick={onClose} />
        </div>
      </div>
    </div>
  );
}
