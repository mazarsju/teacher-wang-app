type GuideStep = {
  title: string;
  description: string;
  imageSrc?: string;
  imageAlt?: string;
};

const GUIDE_STEPS: GuideStep[] = [
  {
    title: "Create an Anki account",
    description:
      "Go to ankiweb.net and create a free account so you can sync decks across devices later.",
    imageSrc: "/anki-connect/01-create-account.png",
    imageAlt: "AnkiWeb sign-up page",
  },
  {
    title: "Install Anki desktop",
    description:
      "Download and install the Anki desktop app for your operating system from apps.ankiweb.net, then open it and sign in if prompted.",
    imageSrc: "/anki-connect/02-install-desktop.png",
    imageAlt: "Anki desktop download page",
  },
  {
    title: "Open Anki add-ons",
    description:
      "In Anki, open Tools → Add-ons → Get Add-ons… to install new plugins.",
    imageSrc: "/anki-connect/03-open-addons.png",
    imageAlt: "Anki Tools menu highlighting Add-ons",
  },
  {
    title: "Install AnkiConnect",
    description:
      "Enter the add-on code 2055492159 and confirm. Restart Anki when prompted.",
    imageSrc: "/anki-connect/04-install-addon.png",
    imageAlt: "Anki Get Add-ons dialog with code 2055492159",
  },
  {
    title: "Allow browser access (CORS)",
    description:
      "In Anki, open Tools → Add-ons → AnkiConnect → Config and set webCorsOriginList to [\"*\"] (or include http://localhost:5173). Restart Anki so learn-mandarin can call AnkiConnect from the app.",
  },
  {
    title: "Verify the connection",
    description:
      "Keep Anki open in the background, then open http://localhost:8765 in a browser. You should see the text “AnkiConnect”. Close this guide to refresh the connection status.",
    imageSrc: "/anki-connect/05-verify-localhost.png",
    imageAlt: "Browser showing AnkiConnect at localhost:8765",
  },
];

type AnkiConnectGuideModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export default function AnkiConnectGuideModal({
  isOpen,
  onClose,
}: AnkiConnectGuideModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-dialog anki-guide-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="anki-connect-guide-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="anki-connect-guide-title" className="modal-title">
          Set up AnkiConnect
        </h2>
        <p className="modal-message">
          learn-mandarin talks to Anki through the AnkiConnect add-on. Follow
          these steps, then close this guide to re-check the connection.
        </p>

        <ol className="anki-guide-steps">
          {GUIDE_STEPS.map((step, index) => (
            <li key={step.title} className="anki-guide-step">
              <div className="anki-guide-step-header">
                <div>
                  <h3 className="anki-guide-step-title"><span className="anki-guide-step-number">{index + 1}</span>&nbsp;{step.title}</h3>
                  <p className="anki-guide-step-description">
                    {step.description}
                  </p>
                </div>
              </div>
              {step.imageSrc && (
                <img
                  className="anki-guide-step-image"
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
          <button
            type="button"
            className="modal-button-confirm-primary"
            onClick={onClose}
          >
            Close and check connection
          </button>
        </div>
      </div>
    </div>
  );
}
