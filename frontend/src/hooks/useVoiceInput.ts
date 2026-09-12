import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { transcribeChatAudio } from "../utils/aiChat/chatApi";

export function useVoiceInput(value: string, setValue: (value: string) => void) {
  const { t } = useTranslation("common");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  async function startRecording() {
    if (isRecording || isTranscribing) {
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
      setIsRecording(true);
    } catch {
      setError(t("voiceInput.errors.microphoneUnavailable"));
    }
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      return;
    }

    mediaRecorderRef.current = null;
    setIsRecording(false);
    setIsTranscribing(true);

    recorder.onstop = () => {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;

      const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      audioChunksRef.current = [];

      transcribeChatAudio(audioBlob)
        .then((text) => {
          setValue(value + text);
        })
        .catch(() => {
          setError(t("voiceInput.errors.transcribeAudio"));
        })
        .finally(() => {
          setIsTranscribing(false);
        });
    };
    recorder.stop();
  }

  return { isRecording, isTranscribing, error, startRecording, stopRecording };
}
