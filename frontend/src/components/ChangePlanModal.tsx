import {
  CheckIcon,
  HourglassIcon,
  IncorrectIcon,
  WarningIcon,
} from "../components/icons";
import type { UserPlan } from "../types/adminUser";
import styles from "./ChangePlanModal.module.css";

type ChangePlanModalProps = {
  isOpen: boolean;
  currentPlan: UserPlan;
  onClose: () => void;
  onSwitchPlan: () => void;
};

const PLANS: Array<{ id: UserPlan; name: string; price: string }> = [
  { id: "free", name: "Free", price: "Free" },
  { id: "pro", name: "Pro", price: "$4.99 / month" },
];

type FeatureIconKind = "check" | "warning" | "cross" | "hourglass";

const FEATURE_ICONS: Record<FeatureIconKind, typeof CheckIcon> = {
  check: CheckIcon,
  warning: WarningIcon,
  cross: IncorrectIcon,
  hourglass: HourglassIcon,
};

type FeatureCell = { text: string; icon: FeatureIconKind };

const PLAN_FEATURES: Array<{
  label: string;
  free: FeatureCell;
  pro: FeatureCell;
}> = [
  {
    label: "Knowledge base management",
    free: { text: "Included", icon: "check" },
    pro: { text: "Included", icon: "check" },
  },
  {
    label: "Anki synchronization",
    free: { text: "Included", icon: "check" },
    pro: { text: "Included", icon: "check" },
  },
  {
    label: "AI chat",
    free: { text: "Limited", icon: "warning" },
    pro: { text: "Generous fair use", icon: "check" },
  },
  {
    label: "Grammar exercises",
    free: { text: "Not available", icon: "cross" },
    pro: { text: "Coming soon", icon: "hourglass" },
  },
];

export default function ChangePlanModal({
  isOpen,
  currentPlan,
  onClose,
  onSwitchPlan,
}: ChangePlanModalProps) {
  if (!isOpen) {
    return null;
  }

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
          Compare plans
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
                        Current plan
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="modal-button-confirm-primary"
                        onClick={onSwitchPlan}
                      >
                        Switch to {plan.name}
                      </button>
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
          <button
            type="button"
            className="modal-button-cancel"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
