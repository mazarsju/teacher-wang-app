import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export type VoiceInputPhase = "idle" | "recording" | "processing";

export function useVoiceInput(
  transcribe: (audio: Blob) => Promise<string>,
  onTranscribed: (text: string) => void,
  onSettled?: () => void,
) {
  const { t } = useTranslation("common");
  const [phase, setPhase] = useState<VoiceInputPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const phaseRef = useRef<VoiceInputPhase>("idle");
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    return () => {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function updatePhase(next: VoiceInputPhase) {
    phaseRef.current = next;
    setPhase(next);
  }

  async function startRecording() {
    if (phaseRef.current !== "idle") {
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setError(null);
      updatePhase("recording");
    } catch {
      setError(t("voiceInput.errors.microphoneUnavailable"));
    }
  }

  function stopRecording() {
    if (phaseRef.current !== "recording") {
      return;
    }
    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      return;
    }

    mediaRecorderRef.current = null;
    updatePhase("processing");

    recorder.onstop = () => {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;

      const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      audioChunksRef.current = [];

      transcribe(audioBlob)
        .then((text) => {
          if (text) {
            onTranscribed(text);
          } else {
            setError(t("voiceInput.errors.noSpeechDetected"));
          }
        })
        .catch((transcribeError) => {
          setError(
            transcribeError instanceof Error
              ? transcribeError.message
              : t("voiceInput.errors.transcribeAudio"),
          );
        })
        .finally(() => {
          updatePhase("idle");
          onSettled?.();
        });
    };
    recorder.stop();
  }

  const pressHandlers = {
    onMouseDown: () => void startRecording(),
    onMouseUp: () => stopRecording(),
    onMouseLeave: () => stopRecording(),
    onTouchStart: (event: { preventDefault: () => void }) => {
      event.preventDefault();
      void startRecording();
    },
    onTouchEnd: (event: { preventDefault: () => void }) => {
      event.preventDefault();
      stopRecording();
    },
    onTouchCancel: () => stopRecording(),
  };

  return { phase, error, pressHandlers };
}
