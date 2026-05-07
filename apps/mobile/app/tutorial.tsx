import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { LargeButton } from "@/components/large-button";
import { useT, type StringKey } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { useHaptics } from "@/lib/haptics";

/**
 * "How to use TechBuddy" — a 6-card carousel of senior-friendly tips.
 *
 * Two modes, picked from the `replay` query param:
 *
 *   - First-run (replay !== "1"): shown automatically by AuthGate the first
 *     time a senior finishes onboarding. Top-right has a Skip link. Both
 *     Skip and Done flip `tutorialSeen` to true and replace the route with
 *     "/" so back-button doesn't bounce them back into the tutorial.
 *
 *   - Replay (replay === "1"): launched from the Settings screen. Top-right
 *     shows a close (X) button instead of a Skip link, neither of which
 *     toggles `tutorialSeen` — replay is read-only with respect to the
 *     first-run gate. Done/close call router.back() to return to Settings.
 *
 * The carousel is tap-driven (Next/Back buttons + dot indicator) rather
 * than swipe-driven on purpose — horizontal swipe gestures are fiddly for
 * many seniors and the bottom Next button is a known-good interaction.
 */
type Card = {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  titleKey: StringKey;
  bodyKey: StringKey;
};

const CARDS: ReadonlyArray<Card> = [
  {
    icon: "happy-outline",
    iconBg: "#E4ECFB",
    iconColor: "#2A6CF6",
    titleKey: "tutorial_welcome_title",
    bodyKey: "tutorial_welcome_body",
  },
  {
    icon: "help-buoy-outline",
    iconBg: "#E4ECFB",
    iconColor: "#2A6CF6",
    titleKey: "tutorial_help_title",
    bodyKey: "tutorial_help_body",
  },
  {
    icon: "mic-outline",
    iconBg: "#FBE9E7",
    iconColor: "#C8312D",
    titleKey: "tutorial_voice_title",
    bodyKey: "tutorial_voice_body",
  },
  {
    icon: "images-outline",
    iconBg: "#E8F4EA",
    iconColor: "#2C8B4B",
    titleKey: "tutorial_photo_title",
    bodyKey: "tutorial_photo_body",
  },
  {
    icon: "time-outline",
    iconBg: "#FFF4E0",
    iconColor: "#B47B0E",
    titleKey: "tutorial_history_title",
    bodyKey: "tutorial_history_body",
  },
  {
    icon: "people-outline",
    iconBg: "#F0E7FB",
    iconColor: "#6B3FB3",
    titleKey: "tutorial_family_title",
    bodyKey: "tutorial_family_body",
  },
];

export default function TutorialScreen() {
  const router = useRouter();
  const { t } = useT();
  const haptics = useHaptics();
  const { setSetting } = useSettings();
  const params = useLocalSearchParams<{ replay?: string }>();
  const isReplay = params.replay === "1";

  const [index, setIndex] = useState(0);
  const isFirst = index === 0;
  const isLast = index === CARDS.length - 1;
  const card = CARDS[index];

  /**
   * Mark the tutorial seen (first-run only) and leave the screen. Replay
   * goes back to wherever it came from (Settings); first-run replaces the
   * route stack with home so the senior can't accidentally hardware-back
   * into the tutorial.
   */
  function leave(success: boolean) {
    if (!isReplay) setSetting("tutorialSeen", true);
    if (success) haptics.notificationSuccess();
    else haptics.selection();
    if (isReplay) router.back();
    else router.replace("/");
  }

  function next() {
    haptics.selection();
    if (isLast) {
      leave(true);
    } else {
      setIndex((i) => i + 1);
    }
  }

  function back() {
    haptics.selection();
    setIndex((i) => Math.max(0, i - 1));
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      {/* Top bar: back chevron, progress text, skip/close ------------------ */}
      <View style={styles.topBar}>
        {!isFirst ? (
          <Pressable
            onPress={back}
            accessibilityRole="button"
            accessibilityLabel={t("tutorial_back_a11y")}
            hitSlop={12}
            style={({ pressed }) => [
              styles.topButton,
              pressed && styles.topButtonPressed,
            ]}
          >
            <Text style={styles.topChevron}>‹</Text>
          </Pressable>
        ) : (
          // Spacer so the progress text stays optically centered on card 1.
          <View style={styles.topButton} />
        )}

        <Text style={styles.progressText}>
          {t("tutorial_progress", {
            current: index + 1,
            total: CARDS.length,
          })}
        </Text>

        <Pressable
          onPress={() => leave(false)}
          accessibilityRole="button"
          accessibilityLabel={
            isReplay ? t("tutorial_close_a11y") : t("tutorial_skip_a11y")
          }
          hitSlop={12}
          style={({ pressed }) => [
            styles.topButton,
            styles.topButtonRight,
            pressed && styles.topButtonPressed,
          ]}
        >
          {isReplay ? (
            <Ionicons name="close" size={26} color="#5A6173" />
          ) : (
            <Text style={styles.skipText}>{t("tutorial_skip")}</Text>
          )}
        </Pressable>
      </View>

      {/* Card body --------------------------------------------------------- */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.iconCircle, { backgroundColor: card.iconBg }]}>
          <Ionicons name={card.icon} size={92} color={card.iconColor} />
        </View>
        <Text style={styles.title}>{t(card.titleKey)}</Text>
        <Text style={styles.body}>{t(card.bodyKey)}</Text>
      </ScrollView>

      {/* Dot indicator + Next / Done button ------------------------------- */}
      <View style={styles.footer}>
        <View
          style={styles.dots}
          accessibilityRole="progressbar"
          accessibilityLabel={t("tutorial_progress", {
            current: index + 1,
            total: CARDS.length,
          })}
        >
          {CARDS.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === index && styles.dotActive]}
            />
          ))}
        </View>

        <LargeButton
          variant="primary"
          label={isLast ? t("tutorial_done") : t("tutorial_next")}
          accessibilityLabel={
            isLast ? t("tutorial_done_a11y") : t("tutorial_next_a11y")
          }
          onPress={next}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },

  // Top bar: back | progress | skip/close.
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 56,
  },
  topButton: {
    minWidth: 88,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  topButtonRight: {
    alignItems: "flex-end",
  },
  topButtonPressed: {
    backgroundColor: "#F0F2F8",
  },
  topChevron: {
    fontSize: 36,
    color: "#2A6CF6",
    lineHeight: 36,
    marginTop: -4,
  },
  skipText: {
    fontSize: 17,
    color: "#5A6173",
    fontWeight: "500",
  },
  progressText: {
    flex: 1,
    textAlign: "center",
    fontSize: 14,
    color: "#5A6173",
    fontWeight: "600",
    letterSpacing: 0.4,
  },

  // Card body.
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircle: {
    width: 168,
    height: 168,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 36,
  },
  title: {
    fontSize: 30,
    fontWeight: "700",
    color: "#1A1F2C",
    textAlign: "center",
    lineHeight: 38,
    marginBottom: 18,
  },
  body: {
    fontSize: 19,
    color: "#5A6173",
    textAlign: "center",
    lineHeight: 28,
    paddingHorizontal: 4,
  },

  // Footer: dots + primary action button.
  footer: {
    paddingHorizontal: 28,
    paddingBottom: 24,
    paddingTop: 8,
  },
  dots: {
    flexDirection: "row",
    alignSelf: "center",
    gap: 8,
    marginBottom: 20,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#D6DAE5",
  },
  dotActive: {
    backgroundColor: "#2A6CF6",
    width: 24,
  },
});
