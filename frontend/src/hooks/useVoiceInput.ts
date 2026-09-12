import { useEffect, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { transcribeChatAudio } from "../utils/aiChat/chatApi";

type VoiceInputElement = HTMLInputElement | HTMLTextAreaElement;

export function useVoiceInput<T extends VoiceInputElement>(
  fieldRef: RefObject<T | null>,
  value: string,
  setValue: (value: string) => void,
) {
  const { t } = useTranslation("common");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const cursorRef = useRef<number | null>(null);
  const hasFocusedRef = useRef(false);

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) {
      return;
    }
    const markFocused = () => {
      hasFocusedRef.current = true;
    };
    field.addEventListener("focus", markFocused);
    return () => field.removeEventListener("focus", markFocused);
  }, [fieldRef]);

  async function startRecording() {
    if (isRecording || isTranscribing) {
      return;
    }

    const field = fieldRef.current;
    cursorRef.current =
      hasFocusedRef.current && field?.selectionStart != null ? field.selectionStart : null;

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
          const field = fieldRef.current;
          const currentValue = field ? field.value : value;
          const insertAt = cursorRef.current ?? currentValue.length;
          const nextValue =
            currentValue.slice(0, insertAt) + text + currentValue.slice(insertAt);
          setValue(nextValue);

          const caret = insertAt + text.length;
          requestAnimationFrame(() => {
            field?.focus();
            field?.setSelectionRange(caret, caret);
          });
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
