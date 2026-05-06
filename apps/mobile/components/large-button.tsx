import { Pressable, StyleSheet, Text, View } from "react-native";

import { useHaptics } from "@/lib/haptics";

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
 *   - Hero variant is a 260pt circle (the "Get Help Now" home button) —
 *     unmistakable target, wide enough for clumsy taps, centered on the
 *     home screen.
 *   - Primary/secondary are at least 64pt tall rectangles (well above the
 *     48pt minimum).
 *   - Label font is 22–32pt — easily readable without reading glasses.
 *   - Press triggers a soft haptic so the senior knows the tap registered.
 *   - High-contrast colors; secondary still meets WCAG AA against white.
 *
 * Note on `helper`: for hero, the helper text does NOT render inside the
 * circle (it would either overflow or shrink the label). The home screen
 * renders the helper as a caption underneath the circle. For
 * primary/secondary, helper renders inside as a second line.
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
  const haptics = useHaptics();

  const handlePress = () => {
    // Routed through useHaptics so the senior's haptics-off setting in
    // Settings is honored. Direct expo-haptics calls would bypass it.
    haptics.impactMedium();
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
        {/* Helper renders inside primary/secondary buttons. For hero, the
            parent screen renders the helper as a caption below the circle. */}
        {!isHero && helper ? (
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

const HERO_DIAMETER = 260;

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
    width: HERO_DIAMETER,
    height: HERO_DIAMETER,
    minHeight: HERO_DIAMETER,
    borderRadius: HERO_DIAMETER / 2,
    paddingVertical: 0,
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
