import * as Haptics from "expo-haptics";

import { useSettings } from "./settings";

/**
 * Returns a small object of haptic helpers that respect the `hapticsEnabled`
 * setting. Use this everywhere instead of calling `Haptics.*` directly so
 * the senior's preference is honored consistently.
 */
export function useHaptics() {
  const { settings } = useSettings();
  const enabled = settings.hapticsEnabled;

  return {
    /** Soft tick used for selection / chip taps / send button. */
    selection: () => {
      if (!enabled) return;
      void Haptics.selectionAsync();
    },
    /** A bit firmer; used when navigating into a section (device picker). */
    impactMedium: () => {
      if (!enabled) return;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
    /** Confirmation pulse after the senior closes a session as resolved. */
    notificationSuccess: () => {
      if (!enabled) return;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  };
}
