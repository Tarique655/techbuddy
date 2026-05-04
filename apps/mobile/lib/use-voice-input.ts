import { useCallback, useState } from "react";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";

import type { Language } from "./i18n";

export type VoiceState = "idle" | "starting" | "listening";

export type VoiceError = {
  /** OS-level error code, e.g. "no-speech", "audio-capture", "network". */
  code: string;
  message: string;
};

export type UseVoiceInputResult = {
  state: VoiceState;
  /** Live transcript while listening; final transcript after stop. */
  transcript: string;
  /** Last error, if any. Cleared on next start(). */
  error: VoiceError | null;
  /** Tap to start listening. Handles permission prompt. */
  start: () => Promise<void>;
  /** Tap to stop early — auto-stop on silence happens on its own. */
  stop: () => void;
  /** Reset transcript + state without affecting the recognizer. */
  reset: () => void;
};

/**
 * Voice input via the device's native speech recognizer.
 *
 * Senior-friendly defaults:
 *   - Auto-stops after ~3 seconds of silence (Android intent extras).
 *     Long enough for a thinking pause, short enough that the senior
 *     doesn't have to remember to tap stop.
 *   - Interim results stream in so the input field updates live as they
 *     speak — they can see they're being heard.
 *   - Audio + recognition stay on-device on modern Android/iOS, so we
 *     don't ship voice clips off the phone.
 *
 * Locale comes from the i18n language: en-US or fr-CA.
 */
export function useVoiceInput(language: Language): UseVoiceInputResult {
  const [state, setState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<VoiceError | null>(null);

  // Live + final transcript stream from the recognizer.
  useSpeechRecognitionEvent("result", (event) => {
    const result = event.results[0];
    if (!result) return;
    setTranscript(result.transcript);
  });

  useSpeechRecognitionEvent("start", () => {
    setState("listening");
    setError(null);
  });

  useSpeechRecognitionEvent("end", () => {
    setState("idle");
  });

  useSpeechRecognitionEvent("error", (event) => {
    setState("idle");
    // "no-speech" fires when the senior taps mic and doesn't speak; not
    // actually an error worth alerting about.
    if (event.error === "no-speech") return;
    setError({
      code: event.error ?? "unknown",
      message: event.message ?? "Voice input failed",
    });
  });

  const start = useCallback(async () => {
    setState("starting");
    setError(null);
    setTranscript("");

    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      setState("idle");
      setError({
        code: "permission_denied",
        message: "Microphone or speech-recognition permission was denied.",
      });
      return;
    }

    ExpoSpeechRecognitionModule.start({
      lang: language === "fr" ? "fr-CA" : "en-US",
      interimResults: true,
      continuous: false,
      // Senior-friendly silence tolerances. The recognizer auto-stops
      // when it hears nothing for this long; bump to 3s so a thinking
      // pause doesn't cut them off.
      androidIntentOptions: {
        EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 3000,
        EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 3000,
        EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS: 2000,
      },
    });
  }, [language]);

  const stop = useCallback(() => {
    ExpoSpeechRecognitionModule.stop();
  }, []);

  const reset = useCallback(() => {
    setTranscript("");
    setError(null);
  }, []);

  return { state, transcript, error, start, stop, reset };
}
