import { useCallback, useEffect, useState } from "react";
import ChallengeCard from "../components/ChallengeCard";
import ChatCharacterCard, {
  type ChatCharacter,
} from "../components/ChatCharacterCard";
import ChatModal from "../components/ChatModal";
import Page from "../components/Page";
import { CHALLENGES } from "../data/challenges";
import { CHAT_CHARACTERS } from "../data/chatCharacters";
import type { Challenge } from "../types/challenge";
import { fetchChallengesProgress } from "../utils/aiChat/challengesApi";

export default function ChatPage() {
  const [selectedCharacter, setSelectedCharacter] =
    useState<ChatCharacter | null>(null);
  const [selectedChallenge, setSelectedChallenge] =
    useState<Challenge | null>(null);
  const [completedChallengeIds, setCompletedChallengeIds] = useState<
    Set<string>
  >(() => new Set());

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

      <p className="chat-intro">Who do you want to speak with today?</p>
      <div className="chat-character-grid">
        {CHAT_CHARACTERS.map((character) => (
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
          {CHALLENGES.map((challenge) => (
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
