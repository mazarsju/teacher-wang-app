type KnowledgeBaseOnboardingBannerProps = {
  onStart: () => void;
};

export default function KnowledgeBaseOnboardingBanner({
  onStart,
}: KnowledgeBaseOnboardingBannerProps) {
  return (
    <div className="kb-onboarding-banner" role="status">
      <p className="kb-onboarding-banner-text">
        Struggling with setting up your knowledge base? Click here for a
        faster and easier onboarding!
      </p>
      <button
        type="button"
        className="kb-onboarding-banner-button"
        onClick={onStart}
      >
        Start building your knowledge base
      </button>
    </div>
  );
}
