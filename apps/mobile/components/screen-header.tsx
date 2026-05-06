import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useT } from "@/lib/i18n";

type Props = {
  title: string;
  /** Called when the senior taps the back button. Pass `router.back`. */
  onBack: () => void;
  /**
   * Optional content rendered on the right side of the header. Examples:
   * the persistent settings cog (devices/chat), the Done button (chat),
   * a settings cog cluster + Done (chat with cog).
   *
   * If omitted, a same-width spacer renders so the centered title stays
   * visually centered between the back button and the right edge.
   */
  right?: ReactNode;
};

/**
 * Standard senior-friendly screen header used across chat, settings,
 * history, devices, about-me. Centered title, big "‹ Back" on the left,
 * optional content on the right via the `right` prop.
 *
 * Why this exists in components/: the same back-button-with-large-arrow
 * pattern was duplicated across five screens with minor drift. One
 * source of truth means future tweaks (color, font scale, accessibility)
 * roll out consistently.
 */
export function ScreenHeader({ title, onBack, right }: Props) {
  const { t } = useT();
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel={t("back_a11y")}
        style={({ pressed }) => [
          styles.backButton,
          pressed && styles.backButtonPressed,
        ]}
        hitSlop={12}
      >
        <Text style={styles.backArrow}>‹</Text>
        <Text style={styles.backText}>{t("back")}</Text>
      </Pressable>

      <Text style={styles.headerTitle}>{title}</Text>

      {right ?? <View style={styles.headerSpacer} />}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E6E8EF",
    minHeight: 56,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    minWidth: 80,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  backButtonPressed: {
    backgroundColor: "#F0F2F8",
  },
  backArrow: {
    fontSize: 32,
    color: "#2A6CF6",
    marginRight: 4,
    lineHeight: 32,
    marginTop: -4,
  },
  backText: {
    fontSize: 18,
    color: "#2A6CF6",
    fontWeight: "500",
  },
  headerTitle: {
    flex: 1,
    fontSize: 22,
    fontWeight: "700",
    color: "#1A1F2C",
    textAlign: "center",
  },
  headerSpacer: {
    minWidth: 80,
  },
});
