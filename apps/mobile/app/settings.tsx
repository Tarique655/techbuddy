import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Sentry from "@sentry/react-native";

import { useAuth } from "@/lib/auth";
import { useT, type Language } from "@/lib/i18n";
import {
  useSettings,
  type FontScale,
} from "@/lib/settings";
import { useHaptics } from "@/lib/haptics";
import { InviteFamilyModal } from "@/components/invite-family-modal";
import {
  listMyFamilyLinks,
  revokeFamilyLink,
  type SeniorFamilyLink,
} from "@/lib/api";
import { safeErrorMessage } from "@/lib/safe-error";
import { formatTimeAgo } from "@/lib/format-time-ago";

export default function SettingsScreen() {
  const router = useRouter();
  const { t, language, setLanguage } = useT();
  const { settings, setSetting } = useSettings();
  const haptics = useHaptics();
  const { user } = useAuth();
  const [inviteFamilyOpen, setInviteFamilyOpen] = useState(false);

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
              { value: "es", label: t("settings_lang_spanish") },
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

        {/* Family ----------------------------------------------------- */}
        <Section title={t("invite_family_section")}>
          <Pressable
            onPress={() => {
              haptics.selection();
              setInviteFamilyOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={t("invite_family_link")}
            style={({ pressed }) => [
              styles.familyRow,
              pressed && styles.familyRowPressed,
            ]}
          >
            <View style={styles.familyText}>
              <Text style={styles.familyLabel}>{t("invite_family_link")}</Text>
              <Text style={styles.familyDesc}>
                {t("invite_family_link_desc")}
              </Text>
            </View>
            <Ionicons name="people-outline" size={22} color="#2A6CF6" />
          </Pressable>

          <View style={styles.divider} />

          <FamilyLinksList
            // Refetch the list whenever the invite modal closes — a senior
            // who just generated a code may have a family member accept it
            // before they navigate away from Settings.
            refetchKey={inviteFamilyOpen ? "open" : "closed"}
          />
        </Section>

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

        {/* Help (diagnostic) ----------------------------------------- */}
        {/*
          Sends a Sentry event tagged with a SHORT SUFFIX of the user's
          id (last 6 chars). Doubles as:
          (1) a way for us to verify Sentry is wired up end-to-end, and
          (2) a real support feature — a senior (or family member) can
          tap this when the app feels off and we'll see context in Sentry.

          Privacy: we deliberately do NOT log the full user id (which is
          the bearer credential — see auth.ts), nor the user's display
          name. The 6-char suffix is enough to disambiguate across a
          beta-sized user base for cross-referencing with the DB without
          exposing PII in Sentry.
        */}
        <Section title={t("settings_section_help")}>
          <Pressable
            onPress={() => {
              haptics.selection();
              const userIdHint = user?.id ? user.id.slice(-6) : "anon";
              Sentry.captureException(
                new Error(
                  `TechBuddy mobile diagnostic — user *${userIdHint} at ${new Date().toISOString()}`
                ),
                {
                  tags: {
                    kind: "user-diagnostic",
                    platform: "mobile",
                    user_hint: userIdHint,
                  },
                }
              );
              Alert.alert(
                t("settings_diagnostic_sent_title"),
                t("settings_diagnostic_sent_body"),
                [{ text: t("alert_ok") }]
              );
            }}
            accessibilityRole="button"
            accessibilityLabel={t("settings_send_diagnostic_a11y")}
            style={({ pressed }) => [
              styles.legalRow,
              pressed && styles.legalRowPressed,
            ]}
          >
            <Text style={styles.legalLabel}>{t("settings_send_diagnostic")}</Text>
            <Ionicons name="paper-plane-outline" size={18} color="#5A6173" />
          </Pressable>
        </Section>
      </ScrollView>

      <InviteFamilyModal
        visible={inviteFamilyOpen}
        onClose={() => setInviteFamilyOpen(false)}
      />
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

/**
 * Senior-side list of currently linked family members. Lives inside the
 * Family section beneath the "Invite a family member" row. Three states:
 *
 *   - loading   → spinner
 *   - error     → muted error line with no retry; reopening Settings refetches
 *   - ready     → list of rows OR an empty-state line
 *
 * Each row shows the family member's name, optional family-side label, and
 * a Remove button that confirms via Alert.alert before calling DELETE.
 */
function FamilyLinksList({ refetchKey }: { refetchKey: string }) {
  const { t, language } = useT();
  const haptics = useHaptics();

  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; links: SeniorFamilyLink[] }
    | { kind: "error" }
  >({ kind: "loading" });

  const load = useCallback(() => {
    setState({ kind: "loading" });
    listMyFamilyLinks()
      .then((links) => setState({ kind: "ready", links }))
      .catch((err: unknown) => {
        console.error("[settings] family links load failed", safeErrorMessage(err));
        setState({ kind: "error" });
      });
  }, []);

  // Refetch on focus so a freshly-accepted invite shows up the next time
  // the senior visits Settings.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Refetch when the invite modal opens or closes — a code shared mid-
  // session may be accepted before the user leaves the screen.
  useEffect(() => {
    load();
  }, [load, refetchKey]);

  function handleRemove(link: SeniorFamilyLink) {
    haptics.selection();
    const displayName = link.familyName;
    Alert.alert(
      t("family_links_remove_confirm_title", { name: displayName }),
      t("family_links_remove_confirm_body", { name: displayName }),
      [
        { text: t("family_links_remove_confirm_no"), style: "cancel" },
        {
          text: t("family_links_remove_confirm_yes"),
          style: "destructive",
          onPress: async () => {
            try {
              await revokeFamilyLink(link.id);
              haptics.notificationSuccess();
              load();
            } catch (err) {
              console.error("[settings] revoke failed", safeErrorMessage(err));
              Alert.alert(
                t("family_links_remove_error_title"),
                t("family_links_remove_error_body"),
                [{ text: t("alert_ok") }]
              );
            }
          },
        },
      ],
      { cancelable: true }
    );
  }

  return (
    <View style={styles.linksWrap}>
      <Text style={styles.linksHeader}>{t("family_links_title")}</Text>

      {state.kind === "loading" ? (
        <View style={styles.linksLoading}>
          <ActivityIndicator size="small" color="#5A6173" />
          <Text style={styles.linksLoadingText}>
            {t("family_links_loading")}
          </Text>
        </View>
      ) : state.kind === "error" ? (
        <Text style={styles.linksError}>{t("family_links_load_error")}</Text>
      ) : state.links.length === 0 ? (
        <Text style={styles.linksEmpty}>{t("family_links_empty")}</Text>
      ) : (
        state.links.map((link) => (
          <FamilyLinkRow
            key={link.id}
            link={link}
            language={language}
            onRemove={() => handleRemove(link)}
          />
        ))
      )}
    </View>
  );
}

/**
 * One row in the linked-family list. Renders the family member's display
 * name, the optional label they chose for the senior (in muted text), the
 * "added X days ago" line, and a Remove button.
 */
function FamilyLinkRow({
  link,
  language,
  onRemove,
}: {
  link: SeniorFamilyLink;
  language: Language;
  onRemove: () => void;
}) {
  const { t } = useT();
  const when = formatTimeAgo(link.createdAt, t, language);
  return (
    <View style={styles.linkRow}>
      <View style={styles.linkRowText}>
        <Text style={styles.linkRowName}>{link.familyName}</Text>
        {link.label ? (
          <Text style={styles.linkRowLabel}>“{link.label}”</Text>
        ) : null}
        <Text style={styles.linkRowWhen}>
          {t("family_links_added_when", { when })}
        </Text>
      </View>
      <Pressable
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel={`${t("family_links_remove")} ${link.familyName}`}
        hitSlop={8}
        style={({ pressed }) => [
          styles.linkRemoveButton,
          pressed && styles.linkRemoveButtonPressed,
        ]}
      >
        <Text style={styles.linkRemoveText}>{t("family_links_remove")}</Text>
      </Pressable>
    </View>
  );
}

// formatTimeAgo lives in @/lib/format-time-ago — see history.tsx for the
// other consumer. The previous bespoke `formatLinkAddedWhen` here threw
// away minute/hour granularity which produced confusingly stale timestamps
// when a senior issued a code and a family member accepted minutes later.

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

  // Family invite row — sits inside the "Family" Section card.
  familyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
  },
  familyRowPressed: {
    opacity: 0.65,
  },
  familyText: {
    flex: 1,
    paddingRight: 12,
  },
  familyLabel: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1A1F2C",
    marginBottom: 2,
  },
  familyDesc: {
    fontSize: 14,
    color: "#5A6173",
    lineHeight: 19,
  },

  // Linked-family-members list (sits below the divider in the Family card).
  linksWrap: {
    paddingTop: 4,
  },
  linksHeader: {
    fontSize: 13,
    fontWeight: "700",
    color: "#5A6173",
    letterSpacing: 0.4,
    marginBottom: 10,
    textTransform: "uppercase",
  },
  linksLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  linksLoadingText: {
    fontSize: 14,
    color: "#5A6173",
  },
  linksEmpty: {
    fontSize: 14,
    color: "#5A6173",
    fontStyle: "italic",
    paddingVertical: 4,
    lineHeight: 19,
  },
  linksError: {
    fontSize: 14,
    color: "#C8312D",
    paddingVertical: 4,
    lineHeight: 19,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
  linkRowText: {
    flex: 1,
    paddingRight: 12,
  },
  linkRowName: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1A1F2C",
    marginBottom: 2,
  },
  linkRowLabel: {
    fontSize: 14,
    color: "#5A6173",
    fontStyle: "italic",
    marginBottom: 2,
  },
  linkRowWhen: {
    fontSize: 13,
    color: "#8E96A8",
  },
  linkRemoveButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#FBEEED",
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  linkRemoveButtonPressed: {
    backgroundColor: "#F5D9D7",
  },
  linkRemoveText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#C8312D",
  },
});
