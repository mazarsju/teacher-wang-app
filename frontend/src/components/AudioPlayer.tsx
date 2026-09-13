import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PauseIcon, PlayIcon } from "./icons";
import styles from "./AudioPlayer.module.css";

const SKIP_SECONDS = 5;
const WAVEFORM_BARS = 60;

async function computePeaks(blob: Blob): Promise<number[]> {
  const AudioContextCtor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextCtor) {
    return [];
  }
  const audioCtx = new AudioContextCtor();
  try {
    const audioBuffer = await audioCtx.decodeAudioData(await blob.arrayBuffer());
    const channelData = audioBuffer.getChannelData(0);
    const blockSize = Math.max(1, Math.floor(channelData.length / WAVEFORM_BARS));
    const peaks: number[] = [];
    for (let bar = 0; bar < WAVEFORM_BARS; bar++) {
      let max = 0;
      const start = bar * blockSize;
      for (let i = start; i < start + blockSize && i < channelData.length; i++) {
        max = Math.max(max, Math.abs(channelData[i]));
      }
      peaks.push(max);
    }
    const scale = Math.max(...peaks, 0.01);
    return peaks.map((p) => p / scale);
  } catch {
    return [];
  } finally {
    void audioCtx.close();
  }
}

type AudioPlayerProps = {
  loadAudio: () => Promise<Blob>;
  showSkipButtons?: boolean;
};

export default function AudioPlayer({
  loadAudio,
  showSkipButtons = false,
}: AudioPlayerProps) {
  const { t } = useTranslation("listening");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [peaks, setPeaks] = useState<number[]>([]);

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration || 0);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    void ensureLoaded();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function ensureLoaded(): Promise<boolean> {
    if (objectUrlRef.current) {
      return true;
    }
    setIsLoading(true);
    setError(null);
    try {
      const blob = await loadAudio();
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      if (audioRef.current) {
        audioRef.current.src = url;
      }
      void computePeaks(blob).then(setPeaks);
      return true;
    } catch {
      setError(t("audioPlayer.loadError"));
      return false;
    } finally {
      setIsLoading(false);
    }
  }

  async function togglePlay() {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }
    const loaded = await ensureLoaded();
    if (!loaded || !audioRef.current) {
      return;
    }
    await audioRef.current.play();
    setIsPlaying(true);
  }

  function skip(seconds: number) {
    const audio = audioRef.current;
    if (!audio || !objectUrlRef.current) {
      return;
    }
    audio.currentTime = Math.min(
      Math.max(audio.currentTime + seconds, 0),
      audio.duration || 0,
    );
  }

  return (
    <div className={styles.audioPlayer}>
      {showSkipButtons && (
        <button
          type="button"
          className={styles.audioPlayerSkipButton}
          onClick={() => skip(-SKIP_SECONDS)}
          aria-label={t("audioPlayer.rewind")}
        >
          -5s
        </button>
      )}
      <button
        type="button"
        className={styles.audioPlayerPlayButton}
        onClick={() => void togglePlay()}
        disabled={isLoading}
        aria-label={isPlaying ? t("audioPlayer.pause") : t("audioPlayer.play")}
      >
        {isPlaying ? (
          <PauseIcon className={styles.audioPlayerIcon} />
        ) : (
          <PlayIcon className={styles.audioPlayerIcon} />
        )}
      </button>
      {showSkipButtons && (
        <button
          type="button"
          className={styles.audioPlayerSkipButton}
          onClick={() => skip(SKIP_SECONDS)}
          aria-label={t("audioPlayer.forward")}
        >
          +5s
        </button>
      )}
      <div className={styles.audioPlayerSeekWrap}>
        {peaks.length > 0 && (
          <div className={styles.audioPlayerWaveform} aria-hidden="true">
            {peaks.map((peak, index) => {
              const isPlayed =
                duration > 0 &&
                (index + 0.5) / peaks.length <= currentTime / duration;
              return (
                <span
                  key={index}
                  className={
                    isPlayed
                      ? styles.audioPlayerBarPlayed
                      : styles.audioPlayerBar
                  }
                  style={{ height: `${Math.max(peak * 100, 8)}%` }}
                />
              );
            })}
          </div>
        )}
        <input
          type="range"
          className={
            peaks.length > 0
              ? styles.audioPlayerSeekOverlay
              : styles.audioPlayerSeek
          }
          min={0}
          max={duration || 0}
          step={0.1}
          value={currentTime}
          onChange={(event) => {
            const time = Number(event.target.value);
            if (audioRef.current) {
              audioRef.current.currentTime = time;
            }
            setCurrentTime(time);
          }}
          aria-label={t("audioPlayer.seek")}
        />
      </div>
      {error && <span className={styles.audioPlayerError}>{error}</span>}
    </div>
  );
}
