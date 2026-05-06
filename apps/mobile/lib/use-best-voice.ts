import { useEffect, useState } from "react";
import * as Speech from "expo-speech";

import { type Language } from "./i18n";

/**
 * Map our app's Language to the BCP-47 locale we want the system to speak in.
 * Mirrors the mapping in chat.tsx so the voice we pick lines up with the
 * locale we'd otherwise hint to Speech.speak.
 */
function languageToLocale(language: Language): string {
  switch (language) {
    case "fr":
      return "fr-CA";
    case "es":
      return "es-ES";
    default:
      return "en-US";
  }
}

/**
 * Score a voice by quality so we can pick the best one. iOS exposes three
 * tiers — "Premium" (newer neural voices, only on iOS 17+), "Enhanced"
 * (downloadable higher-quality), and "Default" (compact, robotic). Android
 * has its own scheme but the same field names map. Treated as opaque
 * strings so we don't crash if expo-speech adds new quality values later.
 */
function qualityScore(quality: string | undefined): number {
  if (quality === "Premium") return 3;
  if (quality === "Enhanced") return 2;
  return 1;
}

/**
 * Pick the best installed system voice for the senior's chosen language.
 *
 * Why this exists: by default `Speech.speak(text, { language })` falls
 * back to the OS's basic compact voice, which on iOS is noticeably
 * robotic. iOS ships with much warmer Enhanced/Premium voices but they
 * have to be requested explicitly via the `voice` option pointing at a
 * specific voice identifier.
 *
 * Returns the voice identifier as a string, or `null` while we're loading
 * the voice list or if no matching voice exists. The chat screen passes
 * the result to Speech.speak; null falls back to the OS default voice
 * (which is what we had before this hook).
 *
 * If the senior hasn't downloaded an Enhanced voice for their language,
 * the highest available quality is Default and they'll keep hearing the
 * compact voice. iOS Settings → Accessibility → Spoken Content → Voices
 * is where they can grab better ones.
 */
export function useBestSpeechVoice(language: Language): string | null {
  const [voiceId, setVoiceId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const targetLocale = languageToLocale(language);
    const targetPrefix = targetLocale.split("-")[0]; // "fr" from "fr-CA"

    Speech.getAvailableVoicesAsync()
      .then((voices) => {
        if (cancelled) return;

        // Prefer voices that exactly match our preferred locale (e.g.
        // fr-CA over fr-FR), then fall back to any voice in the same
        // language family.
        const exact = voices.filter((v) => v.language === targetLocale);
        const family = voices.filter(
          (v) =>
            v.language === targetPrefix ||
            v.language.startsWith(`${targetPrefix}-`)
        );
        const candidates = exact.length > 0 ? exact : family;

        if (candidates.length === 0) {
          setVoiceId(null);
          return;
        }

        // Sort by quality descending; tie-break is irrelevant — any
        // top-quality voice will sound better than a Default one.
        const sorted = [...candidates].sort(
          (a, b) => qualityScore(b.quality) - qualityScore(a.quality)
        );

        setVoiceId(sorted[0].identifier);
      })
      .catch((err: unknown) => {
        // Speech API may be unavailable in some test environments or
        // older OSes; degrade gracefully to the default voice.
        console.warn("[speech] failed to load available voices", err);
        if (!cancelled) setVoiceId(null);
      });

    return () => {
      cancelled = true;
    };
  }, [language]);

  return voiceId;
}
