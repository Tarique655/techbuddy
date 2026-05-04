import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";

type Variant = "hero" | "primary" | "secondary";

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  /** Optional second line of explanatory text under the main label. */
  helper?: string;
  /** Used by screen readers. Falls back to `label` if omitted. */
  accessibilityLabel?: string;
};

/**
 * Senior-friendly button.
 *
 * Design rules from the project doc:
 *   - Hero variant is at least 96pt tall (the "Get Help Now" home button).
 *   - Primary/secondary are at least 64pt tall (well above the 48pt minimum).
 *   - Label font is 22–28pt — easily readable without reading glasses.
 *   - Press triggers a soft haptic so the senior knows the tap registered.
 *   - High-contrast colors; secondary still meets WCAG AA against white.
 */
export function LargeButton({
  label,
  onPress,
  variant = "primary",
  helper,
  accessibilityLabel,
}: Props) {
  const isHero = variant === "hero";
  const isSecondary = variant === "secondary";

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.base,
        isHero && styles.hero,
        isSecondary ? styles.secondary : styles.primary,
        pressed && styles.pressed,
      ]}
    >
      <View>
        <Text
          style={[
            styles.label,
            isHero && styles.heroLabel,
            isSecondary && styles.secondaryLabel,
          ]}
        >
          {label}
        </Text>
        {helper ? (
          <Text
            style={[styles.helper, isSecondary && styles.secondaryHelper]}
          >
            {helper}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 64,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  hero: {
    minHeight: 96,
    paddingVertical: 24,
    borderRadius: 20,
  },
  primary: {
    backgroundColor: "#2A6CF6",
  },
  secondary: {
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#2A6CF6",
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  label: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "600",
    textAlign: "center",
  },
  heroLabel: {
    fontSize: 32,
    fontWeight: "700",
  },
  secondaryLabel: {
    color: "#2A6CF6",
  },
  helper: {
    color: "#FFFFFF",
    fontSize: 16,
    marginTop: 4,
    textAlign: "center",
    opacity: 0.9,
  },
  secondaryHelper: {
    color: "#5A6173",
  },
});
