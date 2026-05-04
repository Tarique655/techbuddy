import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";

import {
  listSessions,
  type DeviceKey,
  type SessionStatus,
  type SessionSummary,
} from "@/lib/api";
import { useT, type Language, type StringKey } from "@/lib/i18n";
import { useHaptics } from "@/lib/haptics";

const DEVICE_LABEL_KEY: Record<DeviceKey, StringKey> = {
  computer: "card_computer",
  phone: "card_phone",
  tablet: "card_tablet",
  tv: "card_tv",
  printer: "card_printer",
  wifi: "card_wifi",
  other: "card_help_session",
};

type BadgeStyle = {
  labelKey: StringKey;
  bg: string;
  fg: string;
};

const STATUS_BADGE: Record<SessionStatus, BadgeStyle | null> = {
  active: { labelKey: "status_active", bg: "#E8EEFB", fg: "#2A6CF6" },
  resolved_ai: { labelKey: "status_resolved", bg: "#E5F4EC", fg: "#1F8A4C" },
  escalated: { labelKey: "status_escalated", bg: "#FFF1D6", fg: "#A85C00" },
  abandoned: null,
};

/** Mirrors Home's time-ago — kept in sync by hand for now. */
function formatTimeAgo(
  iso: string,
  t: (key: StringKey, vars?: Record<string, string | number>) => string,
  language: Language,
  now: Date = new Date()
): string {
  const then = new Date(iso);
  const diffMs = now.getTime() - then.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 2) return t("time_now");
  if (minutes < 60) return t("time_minutes_ago", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return hours === 1 ? t("time_hour_ago") : t("time_hours_ago", { n: hours });
  }
  const days = Math.floor(hours / 24);
  if (days === 1) return t("time_yesterday");
  if (days < 7) return t("time_days_ago", { n: days });
  return then.toLocaleDateString(language === "fr" ? "fr-CA" : undefined, {
    month: "short",
    day: "numeric",
  });
}

export default function HistoryScreen() {
  const router = useRouter();
  const { t, language } = useT();
  const haptics = useHaptics();

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Re-fetch on focus so coming back from a chat shows the freshest list.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoadError(null);
      listSessions()
        .then((s) => {
          if (!cancelled) setSessions(s);
        })
        .catch((err: unknown) => {
          console.error("[history] sessions fetch failed", err);
          if (!cancelled) setLoadError(t("history_load_error"));
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [t])
  );

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

        <Text style={styles.headerTitle}>{t("history_title")}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.emptyState}>
            <ActivityIndicator color="#5A6173" />
          </View>
        ) : loadError ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>{loadError}</Text>
          </View>
        ) : sessions.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>{t("history_empty")}</Text>
          </View>
        ) : (
          sessions.map((s) => {
            const deviceLabel = t(
              s.device ? DEVICE_LABEL_KEY[s.device] : "card_help_session"
            );
            const when = formatTimeAgo(s.startedAt, t, language);
            return (
              <Pressable
                key={s.id}
                onPress={() => {
                  haptics.selection();
                  router.push({
                    pathname: "/chat",
                    params: { sessionId: s.id },
                  });
                }}
                accessibilityRole="button"
                accessibilityLabel={t("open_session_a11y", {
                  device: deviceLabel,
                  when,
                })}
                style={({ pressed }) => [
                  styles.sessionRow,
                  s.status === "abandoned" && styles.sessionRowDim,
                  pressed && styles.sessionRowPressed,
                ]}
              >
                <View style={styles.sessionTitleRow}>
                  <Text style={styles.sessionTitle}>{deviceLabel}</Text>
                  {STATUS_BADGE[s.status] ? (
                    <View
                      style={[
                        styles.badge,
                        { backgroundColor: STATUS_BADGE[s.status]!.bg },
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          { color: STATUS_BADGE[s.status]!.fg },
                        ]}
                      >
                        {t(STATUS_BADGE[s.status]!.labelKey)}
                      </Text>
                    </View>
                  ) : null}
                </View>
                {s.preview ? (
                  <Text style={styles.sessionPreview} numberOfLines={3}>
                    {s.preview}
                  </Text>
                ) : null}
                <Text style={styles.sessionDate}>{when}</Text>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFFFFF" },
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
  backButtonPressed: { backgroundColor: "#F0F2F8" },
  backArrow: {
    fontSize: 32,
    color: "#2A6CF6",
    marginRight: 4,
    lineHeight: 32,
    marginTop: -4,
  },
  backText: { fontSize: 18, color: "#2A6CF6", fontWeight: "500" },
  headerTitle: {
    flex: 1,
    fontSize: 22,
    fontWeight: "700",
    color: "#1A1F2C",
    textAlign: "center",
  },
  headerSpacer: { minWidth: 80 },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 32,
  },
  emptyState: {
    backgroundColor: "#F6F7FB",
    borderRadius: 16,
    padding: 28,
    alignItems: "center",
  },
  emptyStateText: {
    fontSize: 18,
    color: "#5A6173",
    lineHeight: 26,
    textAlign: "center",
  },
  sessionRow: {
    paddingVertical: 18,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#E6E8EF",
    minHeight: 64,
  },
  sessionRowPressed: { backgroundColor: "#F6F7FB" },
  sessionRowDim: { opacity: 0.65 },
  sessionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },
  sessionTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#1A1F2C",
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  sessionPreview: {
    fontSize: 16,
    color: "#5A6173",
    lineHeight: 22,
    marginBottom: 8,
  },
  sessionDate: {
    fontSize: 14,
    color: "#8E96A8",
  },
});
