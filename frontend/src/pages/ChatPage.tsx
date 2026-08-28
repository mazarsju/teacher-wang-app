import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import ChallengeCard from "../components/ChallengeCard";
import ChatCharacterCard, {
  type ChatCharacter,
} from "../components/ChatCharacterCard";
import Banner from "../components/Banner";
import ChatModal from "../components/ChatModal";
import type { PageId } from "../components/Navbar";
import Page from "../components/Page";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { setChallengeProgress } from "../store/slices/challengeProgressSlice";
import { CHALLENGES, NEW_FRIEND_CHALLENGE } from "../data/challenges";
import { CHAT_CHARACTERS, TEACHER_WANG, XIAO_MING } from "../data/chatCharacters";
import type { Challenge } from "../types/challenge";
import { fetchChallengesProgress } from "../utils/aiChat/challengesApi";
import challengeCardStyles from "../components/ChallengeCard.module.css";
import styles from "./ChatPage.module.css";

const KB_CHARACTER_THRESHOLD = 50;

type ChatPageProps = { onNavigate?: (page: PageId) => void };

export default function ChatPage({ onNavigate }: ChatPageProps) {
  const { t } = useTranslation("chat");
  const dispatch = useAppDispatch();
  const [selectedCharacter, setSelectedCharacter] =
    useState<ChatCharacter | null>(null);
  const [selectedChallenge, setSelectedChallenge] =
    useState<Challenge | null>(null);
  const completedChallengeIds = new Set(
    useAppSelector((state) => state.challengeProgress.completedIds),
  );

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
      dispatch(
        setChallengeProgress(
          summary.challenges
            .filter((entry) => entry.completed)
            .map((entry) => entry.id),
        ),
      );
    } catch {
      // Keep the last known progress if the request fails.
    }
  }, [dispatch]);

  useEffect(() => {
    void loadChallengeProgress();
  }, [loadChallengeProgress]);

  return (
    <Page title={t("chatPage.title")}>
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

      {!hasEnoughCharacters && onNavigate && (
        <Banner
          type="info"
          message={t("chatPage.banner.message")}
          buttonMessage={t("chatPage.banner.buttonMessage")}
          actionOnButtonClick={() => onNavigate("knowledge-base")}
        />
      )}

      <p className={styles.chatIntro}>{t("chatPage.intro")}</p>
      <div className={styles.chatCharacterGrid}>
        {visibleCharacters.map((character) => (
          <ChatCharacterCard
            key={character.id}
            character={character}
            onSelect={setSelectedCharacter}
          />
        ))}
      </div>

      <section className={styles.chatChallengesSection} aria-labelledby="challenges-heading">
        <h2 id="challenges-heading" className={styles.chatSectionTitle}>
          {t("chatPage.challengesHeading")}
        </h2>
        <p className={styles.chatSectionDescription}>
          {t("chatPage.challengesDescription")}
        </p>
        <div className={challengeCardStyles.challengeCardGrid}>
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
