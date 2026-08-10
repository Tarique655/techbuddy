import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";

import { LargeButton } from "@/components/large-button";
import { ApiError, resetPassword } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useHaptics } from "@/lib/haptics";
import { useT } from "@/lib/i18n";
import { safeErrorMessage } from "@/lib/safe-error";

/**
 * Deep-link target for the password reset email:
 * techbuddy://reset-password?token=<raw token>
 *
 * Only reachable by opening the email link ON THIS PHONE (there's no web
 * fallback page yet — see ACCOUNTS_AND_PREMIUM_PLAN.md's known limitation
 * on deep-link-only email delivery). If `token` is missing, something's
 * wrong with how the screen was opened; show a plain error rather than a
 * form with nothing to submit.
 */
export default function ResetPasswordScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { setSession } = useAuth();
  const haptics = useHaptics();
  const { t } = useT();

  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    if (!token || newPassword.length < 8 || submitting) return;
    haptics.selection();
    setSubmitting(true);
    try {
      const { user, token: freshToken } = await resetPassword({
        token,
        newPassword,
      });
      setSession({
        user: { id: user.id, name: user.name, email: user.email },
        token: freshToken,
      });
      setDone(true);
      haptics.notificationSuccess();
    } catch (err) {
      setSubmitting(false);
      const message =
        err instanceof ApiError ? err.message : t("generic_error_message");
      console.error("[reset-password] failed", safeErrorMessage(err));
      Alert.alert(t("reset_password_error_title"), message, [
        { text: t("alert_ok") },
      ]);
    }
  }

  if (!token) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.errorBlock}>
          <Text style={styles.title}>{t("reset_password_link_invalid_title")}</Text>
          <Text style={styles.body}>{t("reset_password_link_invalid_body")}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
        keyboardVerticalOffset={Platform.OS === "android" ? 24 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroBlock}>
            <Text style={styles.title}>
              {done ? t("all_set_title") : t("reset_password_title")}
            </Text>
            <Text style={styles.body}>
              {done
                ? t("reset_password_done_body")
                : t("reset_password_body")}
            </Text>

            {!done ? (
              <TextInput
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder={t("reset_password_placeholder")}
                placeholderTextColor="#8E96A8"
                style={styles.input}
                autoFocus
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                returnKeyType="done"
                onSubmitEditing={submit}
                editable={!submitting}
              />
            ) : null}
          </View>

          {!done ? (
            <View style={styles.cta}>
              {submitting ? (
                <View style={styles.submittingBlock}>
                  <ActivityIndicator color="#2A6CF6" />
                  <Text style={styles.submittingText}>{t("reset_password_saving")}</Text>
                </View>
              ) : (
                <LargeButton
                  label={t("reset_password_submit")}
                  onPress={submit}
                  variant="hero"
                />
              )}
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFFFFF" },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 28, paddingBottom: 32, paddingTop: 40 },
  errorBlock: { flex: 1, justifyContent: "center", paddingHorizontal: 28 },
  heroBlock: { flex: 1, justifyContent: "center" },
  title: { fontSize: 32, fontWeight: "700", color: "#1A1F2C", marginBottom: 12, lineHeight: 38 },
  body: { fontSize: 18, color: "#5A6173", lineHeight: 26, marginBottom: 24 },
  input: {
    minHeight: 60,
    backgroundColor: "#F6F7FB",
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    fontSize: 20,
    color: "#1A1F2C",
  },
  cta: { paddingTop: 24, alignItems: "center" },
  submittingBlock: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 64,
    gap: 12,
  },
  submittingText: { fontSize: 18, color: "#5A6173" },
});
