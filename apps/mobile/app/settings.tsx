import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useT, type Language } from "@/lib/i18n";
import {
  useSettings,
  type FontScale,
} from "@/lib/settings";
import { useHaptics } from "@/lib/haptics";

export default function SettingsScreen() {
  const router = useRouter();
  const { t, language, setLanguage } = useT();
  const { settings, setSetting } = useSettings();
  const haptics = useHaptics();

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

        <Text style={styles.headerTitle}>{t("settings")}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Language --------------------------------------------------- */}
        <Section title={t("settings_section_language")}>
          <Segmented
            options={[
              { value: "en", label: t("settings_lang_english") },
              { value: "fr", label: t("settings_lang_french") },
            ]}
            value={language}
            onChange={(v) => {
              haptics.selection();
              setLanguage(v as Language);
            }}
          />
        </Section>

        {/* Text size ------------------------------------------------- */}
        <Section title={t("settings_section_text")}>
          <Segmented
            options={[
              { value: "1", label: t("settings_text_normal") },
              { value: "1.15", label: t("settings_text_large") },
              { value: "1.3", label: t("settings_text_xlarge") },
            ]}
            value={String(settings.fontScale)}
            onChange={(v) => {
              haptics.selection();
              setSetting("fontScale", Number(v) as FontScale);
            }}
          />
          <View style={styles.previewBubble}>
            <Text
              style={[
                styles.previewText,
                { fontSize: 20 * settings.fontScale, lineHeight: 28 * settings.fontScale },
              ]}
            >
              {t("settings_text_preview")}
            </Text>
          </View>
        </Section>

        {/* About me link --------------------------------------------- */}
        <Pressable
          onPress={() => {
            haptics.selection();
            router.push("/about-me");
          }}
          accessibilityRole="button"
          accessibilityLabel={t("about_me_link")}
          style={({ pressed }) => [
            styles.aboutMeLink,
            pressed && styles.aboutMeLinkPressed,
          ]}
        >
          <View style={styles.aboutMeText}>
            <Text style={styles.aboutMeLabel}>{t("about_me_link")}</Text>
            <Text style={styles.aboutMeDesc}>{t("about_me_link_desc")}</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color="#5A6173" />
        </Pressable>

        {/* Sound & speech -------------------------------------------- */}
        <Section title={t("settings_section_audio")}>
          <ToggleRow
            label={t("settings_read_aloud")}
            description={t("settings_read_aloud_desc")}
            value={settings.readAloud}
            onChange={(v) => {
              haptics.selection();
              setSetting("readAloud", v);
            }}
          />
          <View style={styles.divider} />
          <ToggleRow
            label={t("settings_haptics")}
            description={t("settings_haptics_desc")}
            value={settings.hapticsEnabled}
            onChange={(v) => {
              // Note: we tap haptics BEFORE flipping the setting so the
              // senior feels the buzz that confirms what they just turned off.
              if (settings.hapticsEnabled) haptics.selection();
              setSetting("hapticsEnabled", v);
            }}
          />
        </Section>

        {/* Legal ------------------------------------------------------ */}
        <Section title={t("settings_section_legal")}>
          <LegalLink
            label={t("settings_privacy_policy")}
            onPress={() => {
              haptics.selection();
              Linking.openURL(PRIVACY_URL).catch(() => {});
            }}
          />
          <View style={styles.divider} />
          <LegalLink
            label={t("settings_terms_of_service")}
            onPress={() => {
              haptics.selection();
              Linking.openURL(TERMS_URL).catch(() => {});
            }}
          />
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

// ============================================================================
// Public URLs hosted on GitHub Pages (docs/ folder of the repo)
// ============================================================================

const PRIVACY_URL = "https://tarique655.github.io/techbuddy/privacy.html";
const TERMS_URL = "https://tarique655.github.io/techbuddy/terms.html";

// ============================================================================
// Building blocks
// ============================================================================

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function Segmented<V extends string>({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<{ value: V; label: string }>;
  value: V;
  onChange: (v: V) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [
              styles.segOption,
              active && styles.segOptionActive,
              pressed && !active && styles.segOptionPressed,
            ]}
          >
            <Text
              style={[styles.segLabel, active && styles.segLabelActive]}
              numberOfLines={1}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function LegalLink({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const { t } = useT();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={`${label}. ${t("settings_legal_external_a11y")}.`}
      style={({ pressed }) => [
        styles.legalRow,
        pressed && styles.legalRowPressed,
      ]}
    >
      <Text style={styles.legalLabel}>{label}</Text>
      <Ionicons name="open-outline" size={18} color="#5A6173" />
    </Pressable>
  );
}

function ToggleRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleText}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleDescription}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: "#D6DAE5", true: "#A9C5FB" }}
        thumbColor={value ? "#2A6CF6" : "#FFFFFF"}
        ios_backgroundColor="#D6DAE5"
      />
    </View>
  );
}

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
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },

  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#5A6173",
    letterSpacing: 0.6,
    marginBottom: 10,
    paddingHorizontal: 4,
    textTransform: "uppercase",
  },
  sectionCard: {
    backgroundColor: "#F6F7FB",
    borderRadius: 18,
    padding: 16,
  },

  // Segmented control
  segmented: {
    flexDirection: "row",
    backgroundColor: "#E6E9F2",
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  segOption: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 8,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  segOptionActive: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#1A1F2C",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  segOptionPressed: {
    backgroundColor: "#DCE2EE",
  },
  segLabel: {
    fontSize: 15,
    fontWeight: "500",
    color: "#5A6173",
  },
  segLabelActive: {
    color: "#1A1F2C",
    fontWeight: "700",
  },

  // Text-size preview
  previewBubble: {
    marginTop: 14,
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E6E8EF",
  },
  previewText: {
    color: "#1A1F2C",
  },

  // Toggle rows
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
  },
  toggleText: {
    flex: 1,
    paddingRight: 12,
  },
  toggleLabel: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1A1F2C",
    marginBottom: 2,
  },
  toggleDescription: {
    fontSize: 14,
    color: "#5A6173",
    lineHeight: 19,
  },
  divider: {
    height: 1,
    backgroundColor: "#E6E8EF",
    marginVertical: 12,
  },

  // Legal links
  legalRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  legalRowPressed: {
    opacity: 0.65,
  },
  legalLabel: {
    flex: 1,
    fontSize: 17,
    fontWeight: "500",
    color: "#1A1F2C",
  },

  // About me link row
  aboutMeLink: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 18,
    backgroundColor: "#F6F7FB",
    marginBottom: 28,
  },
  aboutMeLinkPressed: { backgroundColor: "#E4ECFB" },
  aboutMeText: { flex: 1, paddingRight: 12 },
  aboutMeLabel: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1A1F2C",
    marginBottom: 2,
  },
  aboutMeDesc: { fontSize: 14, color: "#5A6173", lineHeight: 19 },
});
