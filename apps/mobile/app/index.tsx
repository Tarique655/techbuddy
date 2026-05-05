import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { LargeButton } from "@/components/large-button";
import { useAuth } from "@/lib/auth";
import { useT, type StringKey } from "@/lib/i18n";
import { useHaptics } from "@/lib/haptics";

function getGreetingKey(now: Date = new Date()): StringKey {
  const hour = now.getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

export default function HomeScreen() {
  const router = useRouter();
  const { t } = useT();
  const haptics = useHaptics();
  const { user } = useAuth();
  // AuthGate guarantees a user is present on this screen, but TypeScript
  // doesn't know that — fall back gracefully if it's somehow not.
  const seniorName = user?.name ?? "";

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/*
          Brand row: spacer | logo (centered) | settings cog. Inline flex
          keeps the cog vertically aligned with the TECHBUDDY wordmark and
          keeps it below the system bar / display cutout (Galaxy S10+
          punch-hole was overlapping the previous absolute-positioned cog).
        */}
        <View style={styles.brandRow}>
          <View style={styles.brandSpacer} />
          <Text style={styles.brand}>TECHBUDDY</Text>
          <Pressable
            onPress={() => {
              haptics.selection();
              router.push("/settings");
            }}
            accessibilityRole="button"
            accessibilityLabel={t("settings_a11y")}
            hitSlop={10}
            style={({ pressed }) => [
              styles.settingsButton,
              pressed && styles.settingsButtonPressed,
            ]}
          >
            <Ionicons name="settings-outline" size={22} color="#2A6CF6" />
          </Pressable>
        </View>

        <View style={styles.greetingBlock}>
          <Text style={styles.greeting}>
            {t(getGreetingKey())}, {seniorName}.
          </Text>
          <Text style={styles.subgreeting}>{t("home_subtitle")}</Text>
        </View>

        <View style={styles.heroBlock}>
          <LargeButton
            variant="hero"
            label={t("get_help_now")}
            accessibilityLabel={t("get_help_now_a11y")}
            onPress={() => router.push("/devices")}
          />
          {/* Helper text renders BELOW the circular hero button — see
              LargeButton's note about why hero ignores its `helper` prop. */}
          <Text style={styles.heroHelper}>{t("get_help_now_helper")}</Text>
        </View>

        {/* Spacer pushes the history button to the bottom of the viewport. */}
        <View style={styles.flexSpacer} />

        <View style={styles.footer}>
          <LargeButton
            variant="secondary"
            label={t("see_all_history")}
            onPress={() => router.push("/history")}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const SETTINGS_BUTTON_SIZE = 40;

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    paddingBottom: 24,
  },
  brandSpacer: {
    // Same width as the settings button so the brand text stays optically
    // centered. Height matches too so vertical alignment is symmetric.
    width: SETTINGS_BUTTON_SIZE,
    height: SETTINGS_BUTTON_SIZE,
  },
  brand: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 1,
    color: "#2A6CF6",
  },
  settingsButton: {
    width: SETTINGS_BUTTON_SIZE,
    height: SETTINGS_BUTTON_SIZE,
    borderRadius: 999,
    backgroundColor: "#F1F4FB",
    alignItems: "center",
    justifyContent: "center",
  },
  settingsButtonPressed: {
    backgroundColor: "#E4ECFB",
    transform: [{ scale: 0.96 }],
  },
  greetingBlock: {
    marginBottom: 32,
  },
  greeting: {
    fontSize: 32,
    fontWeight: "700",
    color: "#1A1F2C",
    marginBottom: 8,
  },
  subgreeting: {
    fontSize: 22,
    color: "#5A6173",
    lineHeight: 30,
  },
  heroBlock: {
    alignItems: "center",
    marginBottom: 24,
  },
  heroHelper: {
    fontSize: 18,
    color: "#5A6173",
    textAlign: "center",
    marginTop: 16,
    paddingHorizontal: 24,
    lineHeight: 24,
  },
  flexSpacer: {
    flex: 1,
    minHeight: 16,
  },
  footer: {
    paddingTop: 8,
  },
});
