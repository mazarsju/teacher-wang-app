import { useCallback, useEffect, useState } from "react";
import ChallengeCard from "../components/ChallengeCard";
import ChatCharacterCard, {
  type ChatCharacter,
} from "../components/ChatCharacterCard";
import ChatModal from "../components/ChatModal";
import type { PageId } from "../components/Navbar";
import Page from "../components/Page";
import { useAppSelector } from "../store/hooks";
import { CHALLENGES, NEW_FRIEND_CHALLENGE } from "../data/challenges";
import { CHAT_CHARACTERS, TEACHER_WANG, XIAO_MING } from "../data/chatCharacters";
import type { Challenge } from "../types/challenge";
import { fetchChallengesProgress } from "../utils/aiChat/challengesApi";

const KB_CHARACTER_THRESHOLD = 50;

type ChatPageProps = { onNavigate?: (page: PageId) => void };

export default function ChatPage({ onNavigate }: ChatPageProps) {
  const [selectedCharacter, setSelectedCharacter] =
    useState<ChatCharacter | null>(null);
  const [selectedChallenge, setSelectedChallenge] =
    useState<Challenge | null>(null);
  const [completedChallengeIds, setCompletedChallengeIds] = useState<
    Set<string>
  >(() => new Set());

  const characterCount = useAppSelector((state) => state.characters.items.length);
  const currentHskLevel = useAppSelector(
    (state) => state.hsk.status?.current_level ?? 0,
  );
  const hasEnoughCharacters = characterCount >= KB_CHARACTER_THRESHOLD;
  const isNewFriendChallengeDone = completedChallengeIds.has(
    NEW_FRIEND_CHALLENGE.id,
  );
  const visibleCharacters = hasEnoughCharacters
    ? CHAT_CHARACTERS.filter(
        (character) => character.id !== XIAO_MING.id || isNewFriendChallengeDone,
      )
    : [TEACHER_WANG];
  const visibleChallenges = hasEnoughCharacters
    ? CHALLENGES.filter(
        (challenge) =>
          challenge.hskLevel <= currentHskLevel &&
          (challenge.id !== NEW_FRIEND_CHALLENGE.id || !isNewFriendChallengeDone),
      )
    : [];

  const loadChallengeProgress = useCallback(async () => {
    try {
      const summary = await fetchChallengesProgress();
      setCompletedChallengeIds(
        new Set(
          summary.challenges
            .filter((entry) => entry.completed)
            .map((entry) => entry.id),
        ),
      );
    } catch {
      // Keep the last known progress if the request fails.
    }
  }, []);

  useEffect(() => {
    void loadChallengeProgress();
  }, [loadChallengeProgress]);

  return (
    <Page title="Chat">
      <ChatModal
        character={selectedCharacter}
        onClose={() => setSelectedCharacter(null)}
      />
      <ChatModal
        character={selectedChallenge?.character ?? null}
        onClose={() => {
          setSelectedChallenge(null);
          void loadChallengeProgress();
        }}
        tasks={selectedChallenge?.tasks}
        challengeTitle={selectedChallenge?.title}
      />

      {!hasEnoughCharacters && (
        <div className="kb-onboarding-banner" role="status">
          <p className="kb-onboarding-banner-text">
            Build your knowledge base to unlock more people to talk to!
          </p>
          {onNavigate && (
            <button
              type="button"
              className="kb-onboarding-banner-button"
              onClick={() => onNavigate("knowledge-base")}
            >
              Go to knowledge base
            </button>
          )}
        </div>
      )}

      <p className="chat-intro">Who do you want to speak with today?</p>
      <div className="chat-character-grid">
        {visibleCharacters.map((character) => (
          <ChatCharacterCard
            key={character.id}
            character={character}
            onSelect={setSelectedCharacter}
          />
        ))}
      </div>

      <section className="chat-challenges-section" aria-labelledby="challenges-heading">
        <h2 id="challenges-heading" className="chat-section-title">
          Challenges
        </h2>
        <p className="chat-section-description">
          Practice real-life conversations with guided tasks.
        </p>
        <div className="challenge-card-grid">
          {visibleChallenges.map((challenge) => (
            <ChallengeCard
              key={challenge.id}
              challenge={challenge}
              completed={completedChallengeIds.has(challenge.id)}
              onSelect={setSelectedChallenge}
            />
          ))}
        </div>
      </section>
    </Page>
  );
}
