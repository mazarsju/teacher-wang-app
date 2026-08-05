type KnowledgeBaseSuggestionsBannerProps = {
  onStart: () => void;
};

export default function KnowledgeBaseSuggestionsBanner({
  onStart,
}: KnowledgeBaseSuggestionsBannerProps) {
  return (
    <div className="kb-onboarding-banner" role="status">
      <p className="kb-onboarding-banner-text">
        Need some inspiration for your next word to learn?
      </p>
      <button
        type="button"
        className="kb-onboarding-banner-button"
        onClick={onStart}
      >
        Add next word
      </button>
    </div>
  );
}
