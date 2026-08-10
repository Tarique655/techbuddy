import { useEffect, useState } from "react";
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
import { CheckboxRow } from "@/components/checkbox-row";
import { ApiError, login } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useHaptics } from "@/lib/haptics";
import { useT } from "@/lib/i18n";
import { safeErrorMessage } from "@/lib/safe-error";
import {
  forgetPassword,
  getRememberedEmail,
  getRememberedPassword,
  rememberEmail,
  rememberPassword,
} from "@/lib/remembered-credentials";

/**
 * Email + password sign-in for a returning senior (new device, reinstall,
 * or anyone who's claimed their account — see ACCOUNTS_AND_PREMIUM_PLAN.md).
 */
export default function LoginScreen() {
  const router = useRouter();
  const { setSession } = useAuth();
  const haptics = useHaptics();
  const { t } = useT();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberPasswordChecked, setRememberPasswordChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Prefill from what was remembered on a previous signup/login. Email is
  // always remembered automatically; password only if the checkbox was
  // ticked last time — if we find one, the checkbox starts ticked too, so
  // unticking-and-submitting reads as "stop remembering" rather than
  // silently keeping the old value around.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [savedEmail, savedPassword] = await Promise.all([
        getRememberedEmail(),
        getRememberedPassword(),
      ]);
      if (cancelled) return;
      if (savedEmail) setEmail(savedEmail);
      if (savedPassword) {
        setPassword(savedPassword);
        setRememberPasswordChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password || submitting) return;

    haptics.selection();
    setSubmitting(true);
    try {
      const { user, token } = await login({ email: trimmedEmail, password });
      // AuthGate redirects automatically once setSession writes state.
      setSession({ user: { id: user.id, name: user.name, email: user.email }, token });

      // Best-effort, fire-and-forget — never block getting into the app.
      void rememberEmail(trimmedEmail);
      if (rememberPasswordChecked) {
        void rememberPassword(password);
      } else {
        void forgetPassword();
      }
    } catch (err) {
      setSubmitting(false);
      const message =
        err instanceof ApiError ? err.message : t("generic_error_message");
      console.error("[login] failed", safeErrorMessage(err));
      Alert.alert(t("login_error_title"), message, [{ text: t("alert_ok") }]);
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

          <View style={styles.heroBlock}>
            <Text style={styles.title}>{t("login_title")}</Text>
            <Text style={styles.body}>{t("login_body")}</Text>

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
              returnKeyType="next"
              editable={!submitting}
            />

            <Text style={styles.label}>{t("field_password_label")}</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder={t("login_password_placeholder")}
              placeholderTextColor="#8E96A8"
              style={styles.input}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="password"
              returnKeyType="done"
              onSubmitEditing={submit}
              editable={!submitting}
            />

            <View style={styles.checkboxWrap}>
              <CheckboxRow
                checked={rememberPasswordChecked}
                onToggle={setRememberPasswordChecked}
                label={t("login_remember_password_label")}
                helper={t("login_remember_password_helper")}
                disabled={submitting}
              />
            </View>

            <Pressable
              onPress={() => {
                haptics.selection();
                router.push("/forgot-password");
              }}
              accessibilityRole="link"
              style={styles.forgotLink}
              hitSlop={8}
            >
              <Text style={styles.forgotText}>{t("login_forgot_link")}</Text>
            </Pressable>
          </View>

          <View style={styles.cta}>
            {submitting ? (
              <View style={styles.submittingBlock}>
                <ActivityIndicator color="#2A6CF6" />
                <Text style={styles.submittingText}>{t("login_submitting")}</Text>
              </View>
            ) : (
              <LargeButton label={t("login_submit")} onPress={submit} variant="hero" />
            )}
          </View>
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
  heroBlock: { paddingTop: 12 },
  title: { fontSize: 32, fontWeight: "700", color: "#1A1F2C", marginBottom: 12, lineHeight: 38 },
  body: { fontSize: 18, color: "#5A6173", lineHeight: 26, marginBottom: 24 },
  label: { fontSize: 16, fontWeight: "600", color: "#5A6173", marginBottom: 8, marginTop: 16 },
  input: {
    minHeight: 60,
    backgroundColor: "#F6F7FB",
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    fontSize: 20,
    color: "#1A1F2C",
  },
  checkboxWrap: { marginTop: 16 },
  forgotLink: { marginTop: 12, alignSelf: "flex-start", minHeight: 44, justifyContent: "center" },
  forgotText: { fontSize: 16, color: "#2A6CF6", fontWeight: "600" },
  cta: { paddingTop: 32, alignItems: "center" },
  submittingBlock: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 64,
    gap: 12,
  },
  submittingText: { fontSize: 18, color: "#5A6173" },
});
