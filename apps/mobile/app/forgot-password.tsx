import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { LargeButton } from "@/components/large-button";
import { forgotPassword } from "@/lib/api";
import { useHaptics } from "@/lib/haptics";
import { useT } from "@/lib/i18n";
import { safeErrorMessage } from "@/lib/safe-error";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const haptics = useHaptics();
  const { t } = useT();

  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    const trimmed = email.trim();
    if (!trimmed || submitting) return;

    haptics.selection();
    setSubmitting(true);
    try {
      await forgotPassword(trimmed);
      setSent(true);
      haptics.notificationSuccess();
    } catch (err) {
      console.error("[forgot-password] failed", safeErrorMessage(err));
      Alert.alert(
        t("onboarding_error_title"),
        t("forgot_password_error_body"),
        [{ text: t("alert_ok") }]
      );
    } finally {
      setSubmitting(false);
    }
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
          <Pressable
            onPress={() => {
              haptics.selection();
              router.back();
            }}
            accessibilityRole="button"
            accessibilityLabel={t("account_back_a11y")}
            style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
            hitSlop={12}
          >
            <Text style={styles.backArrow}>‹</Text>
            <Text style={styles.backText}>{t("back")}</Text>
          </Pressable>

          {sent ? (
            <View style={styles.heroBlock}>
              <Text style={styles.title}>{t("forgot_password_sent_title")}</Text>
              <Text style={styles.body}>{t("forgot_password_sent_body")}</Text>
              <View style={styles.cta}>
                <LargeButton
                  label={t("forgot_password_back_to_signin")}
                  variant="secondary"
                  onPress={() => {
                    haptics.selection();
                    router.back();
                  }}
                />
              </View>
            </View>
          ) : (
            <>
              <View style={styles.heroBlock}>
                <Text style={styles.title}>{t("forgot_password_title")}</Text>
                <Text style={styles.body}>{t("forgot_password_body")}</Text>

                <Text style={styles.label}>{t("field_email_label")}</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor="#8E96A8"
                  style={styles.input}
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  returnKeyType="done"
                  onSubmitEditing={submit}
                  editable={!submitting}
                />
              </View>

              <View style={styles.cta}>
                {submitting ? (
                  <View style={styles.submittingBlock}>
                    <ActivityIndicator color="#2A6CF6" />
                    <Text style={styles.submittingText}>{t("forgot_password_sending")}</Text>
                  </View>
                ) : (
                  <LargeButton label={t("forgot_password_submit")} onPress={submit} variant="hero" />
                )}
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFFFFF" },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 28, paddingBottom: 32 },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    minWidth: 80,
    paddingHorizontal: 8,
    marginTop: 8,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  backButtonPressed: { backgroundColor: "#F0F2F8" },
  backArrow: { fontSize: 32, color: "#2A6CF6", marginRight: 4, lineHeight: 32, marginTop: -4 },
  backText: { fontSize: 18, color: "#2A6CF6", fontWeight: "500" },
  heroBlock: { paddingTop: 12, flex: 1, justifyContent: "center" },
  title: { fontSize: 32, fontWeight: "700", color: "#1A1F2C", marginBottom: 12, lineHeight: 38 },
  body: { fontSize: 18, color: "#5A6173", lineHeight: 26, marginBottom: 24 },
  label: { fontSize: 16, fontWeight: "600", color: "#5A6173", marginBottom: 8, marginTop: 8 },
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
