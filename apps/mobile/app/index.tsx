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
        <View style={styles.brandRow}>
          <Text style={styles.brand}>TECHBUDDY</Text>
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
            helper={t("get_help_now_helper")}
            accessibilityLabel={t("get_help_now_a11y")}
            onPress={() => router.push("/devices")}
          />
        </View>

        <View style={styles.footer}>
          <LargeButton
            variant="secondary"
            label={t("see_all_history")}
            onPress={() => router.push("/history")}
          />
        </View>
      </ScrollView>

      {/*
        Settings gear, sticky in the top-right corner. Sits outside the
        ScrollView so it stays in place as the senior scrolls.
      */}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  brandRow: {
    paddingTop: 8,
    paddingBottom: 12,
    alignItems: "center",
  },
  brand: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 1,
    color: "#2A6CF6",
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
    marginBottom: 40,
  },
  footer: {
    marginTop: 8,
  },
  settingsButton: {
    position: "absolute",
    top: 8,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: "#F1F4FB",
    alignItems: "center",
    justifyContent: "center",
  },
  settingsButtonPressed: {
    backgroundColor: "#E4ECFB",
    transform: [{ scale: 0.96 }],
  },
});
