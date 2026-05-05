import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import type { DeviceKey } from "@/lib/api";
import { useT, type StringKey } from "@/lib/i18n";
import { useHaptics } from "@/lib/haptics";

type DeviceOption = {
  key: DeviceKey;
  labelKey: StringKey;
  captionKey: StringKey;
  icon: React.ComponentProps<typeof Ionicons>["name"];
};

const DEVICES: DeviceOption[] = [
  {
    key: "computer",
    labelKey: "device_computer",
    captionKey: "device_computer_caption",
    icon: "laptop-outline",
  },
  {
    key: "phone",
    labelKey: "device_phone",
    captionKey: "device_phone_caption",
    icon: "phone-portrait-outline",
  },
  {
    key: "tablet",
    labelKey: "device_tablet",
    captionKey: "device_tablet_caption",
    icon: "tablet-portrait-outline",
  },
  {
    key: "tv",
    labelKey: "device_tv",
    captionKey: "device_tv_caption",
    icon: "tv-outline",
  },
  {
    key: "wifi",
    labelKey: "device_wifi",
    captionKey: "device_wifi_caption",
    icon: "wifi-outline",
  },
  {
    key: "other",
    labelKey: "device_other",
    captionKey: "device_other_caption",
    icon: "help-circle-outline",
  },
];

export default function DevicesScreen() {
  const router = useRouter();
  const { t } = useT();
  const haptics = useHaptics();

  function pick(device: DeviceKey) {
    haptics.impactMedium();
    router.push({ pathname: "/chat", params: { device } });
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
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

        <Text style={styles.headerTitle}>{t("devices_header")}</Text>

        {/*
          Settings cog. Wrapped in a fixed-width container that mirrors the
          back button's width so the centered title stays visually centered.
        */}
        <View style={styles.headerRight}>
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
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.intro}>
          <Text style={styles.introTitle}>{t("devices_q")}</Text>
        </View>

        <View style={styles.grid}>
          {DEVICES.map((d) => (
            <DeviceCard key={d.key} device={d} onPress={() => pick(d.key)} />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function DeviceCard({
  device,
  onPress,
}: {
  device: DeviceOption;
  onPress: () => void;
}) {
  const { t } = useT();
  const label = t(device.labelKey);
  const caption = t(device.captionKey);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${caption}.`}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.cardIconWrap}>
        <Ionicons name={device.icon} size={56} color="#2A6CF6" />
      </View>
      <Text style={styles.cardLabel}>{label}</Text>
      <Text style={styles.cardCaption}>{caption}</Text>
    </Pressable>
  );
}

const CARD_GAP = 14;

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
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
  // Right-side container for the settings cog. Same minWidth as the back
  // button so the centered title stays optically centered between them.
  headerRight: {
    minWidth: 80,
    alignItems: "flex-end",
    justifyContent: "center",
    paddingRight: 8,
  },
  settingsButton: {
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
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  intro: {
    paddingTop: 16,
    paddingBottom: 24,
  },
  introTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1A1F2C",
    marginBottom: 8,
  },
  introBody: {
    fontSize: 20,
    color: "#5A6173",
    lineHeight: 28,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: CARD_GAP,
  },
  card: {
    width: `48%`,
    minHeight: 168,
    backgroundColor: "#F6F7FB",
    borderRadius: 20,
    paddingVertical: 22,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  cardPressed: {
    backgroundColor: "#E8EEFB",
    transform: [{ scale: 0.98 }],
  },
  cardIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  cardLabel: {
    fontSize: 20,
    fontWeight: "600",
    color: "#1A1F2C",
    textAlign: "center",
  },
  cardCaption: {
    fontSize: 14,
    color: "#5A6173",
    textAlign: "center",
    marginTop: 4,
  },
});
