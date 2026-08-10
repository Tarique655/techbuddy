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
import { CheckboxRow } from "@/components/checkbox-row";
import { ApiError, signup } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT, type StringKey } from "@/lib/i18n";
import { useHaptics } from "@/lib/haptics";
import { safeErrorMessage } from "@/lib/safe-error";
import {
  forgetPassword,
  rememberEmail,
  rememberPassword,
} from "@/lib/remembered-credentials";

type Step = "welcome" | "signup";

// `message` is an i18n key, not literal text, so the caller can translate it
// with whatever language is currently active — this function has no access
// to `t()` itself (it's a plain, easily-testable pure function).
type DobResult =
  | { ok: true; value?: string }
  | { ok: false; message: StringKey };

/**
 * Combine the three MM/DD/YYYY fields into a "YYYY-MM-DD" string for the
 * API, or validate that they're consistently blank (date of birth is
 * optional as a whole, but a half-filled date isn't accepted — that's
 * more likely a mis-tap than an intentional partial answer).
 */
function buildDateOfBirth(month: string, day: string, year: string): DobResult {
  const m = month.trim();
  const d = day.trim();
  const y = year.trim();

  if (!m && !d && !y) return { ok: true, value: undefined };
  if (!m || !d || !y) {
    return { ok: false, message: "signup_dob_incomplete" };
  }

  const mm = Number(m);
  const dd = Number(d);
  const yyyy = Number(y);
  const now = new Date();

  if (!Number.isInteger(mm) || mm < 1 || mm > 12) {
    return { ok: false, message: "signup_dob_invalid_month" };
  }
  if (!Number.isInteger(dd) || dd < 1 || dd > 31) {
    return { ok: false, message: "signup_dob_invalid_day" };
  }
  if (
    !Number.isInteger(yyyy) ||
    yyyy < now.getFullYear() - 130 ||
    yyyy > now.getFullYear()
  ) {
    return { ok: false, message: "signup_dob_invalid_year" };
  }

  const iso = `${String(yyyy).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  const parsed = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.getTime() > now.getTime()) {
    return { ok: false, message: "signup_dob_invalid_date" };
  }

  return { ok: true, value: iso };
}

/**
 * First-launch onboarding. As of 2026-08-09 (see
 * ACCOUNTS_AND_PREMIUM_PLAN.md), every new senior fills in name, optional
 * date of birth, email, and password up front — there is no more anonymous
 * name-only quick path for NEW installs. This was a deliberate reversal
 * of the original "accounts are optional, claim later" decision, made
 * explicitly by Tariq.
 *
 * Existing anonymous accounts created before this change are untouched —
 * they keep working exactly as they did, and can still add email &
 * password later from Settings ("Add email & password", claim-account-modal.tsx).
 */
export default function OnboardingScreen() {
  const { t } = useT();
  const { setSession } = useAuth();
  const haptics = useHaptics();
  const router = useRouter();

  const [step, setStep] = useState<Step>("welcome");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Defaults to on — this app is explicitly optimizing for "fewer things
  // for a senior to retype", per Tariq's product decision. They can
  // untick it before submitting if they'd rather not.
  const [rememberPasswordChecked, setRememberPasswordChecked] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function submitSignup() {
    if (submitting) return;

    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    const trimmedEmail = email.trim();

    // Explicit, specific feedback for whatever's missing — a silently
    // no-op button (which is what a bare `if (!valid) return;` produces)
    // reads as "broken" to a senior, especially since LargeButton has no
    // disabled/greyed-out visual state to hint at why nothing happened.
    if (!trimmedFirst || !trimmedLast) {
      Alert.alert(t("signup_almost_there_title"), t("signup_missing_name_body"), [
        { text: t("alert_ok") },
      ]);
      return;
    }
    if (!trimmedEmail) {
      Alert.alert(t("signup_almost_there_title"), t("signup_missing_email_body"), [
        { text: t("alert_ok") },
      ]);
      return;
    }
    if (password.length < 8) {
      Alert.alert(
        t("signup_almost_there_title"),
        t("signup_password_too_short_body"),
        [{ text: t("alert_ok") }]
      );
      return;
    }

    const dob = buildDateOfBirth(birthMonth, birthDay, birthYear);
    if (!dob.ok) {
      Alert.alert(t("signup_dob_error_title"), t(dob.message), [
        { text: t("alert_ok") },
      ]);
      return;
    }

    haptics.selection();
    setSubmitting(true);
    try {
      const { user, token } = await signup({
        firstName: trimmedFirst,
        lastName: trimmedLast,
        dateOfBirth: dob.value,
        email: trimmedEmail,
        password,
      });
      // Once setSession writes to SecureStore, AuthGate redirects to /
      // automatically — no need for router.replace here.
      setSession({
        user: {
          id: user.id,
          name: user.name,
          firstName: user.firstName,
          lastName: user.lastName,
          dateOfBirth: user.dateOfBirth,
          email: user.email,
        },
        token,
      });

      // Best-effort, fire-and-forget — remembering credentials is a
      // convenience and must never block getting into the app.
      void rememberEmail(trimmedEmail);
      if (rememberPasswordChecked) {
        void rememberPassword(password);
      } else {
        void forgetPassword();
      }
    } catch (err) {
      setSubmitting(false);
      console.error("[onboarding] signup failed", safeErrorMessage(err));
      const message =
        err instanceof ApiError ? err.message : t("signup_error_fallback");
      Alert.alert(t("signup_error_title"), message, [{ text: t("alert_ok") }]);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        // iOS: padding adds bottom inset equal to keyboard height.
        // Android: height resizes the avoiding view itself; combined with
        // `softwareKeyboardLayoutMode: "resize"` in app.json, this keeps
        // focused inputs above the keyboard. Without behavior set on
        // Android, the keyboard covers the input — which is what we hit.
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
        keyboardVerticalOffset={Platform.OS === "android" ? 24 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brandRow}>
            <Text style={styles.brand}>TECHBUDDY</Text>
          </View>

          {step === "welcome" ? (
            <>
              <View style={styles.heroBlock}>
                <Text style={styles.title}>
                  {t("onboarding_welcome_title")}
                </Text>
                <Text style={styles.body}>
                  {t("onboarding_welcome_body")}
                </Text>
              </View>

              <View style={styles.cta}>
                <LargeButton
                  variant="hero"
                  label={t("onboarding_welcome_cta")}
                  onPress={() => {
                    haptics.selection();
                    setStep("signup");
                  }}
                />
              </View>

              {/* Returning senior with an email+password account (fresh
                  signup, or claimed from Settings on another device) —
                  see ACCOUNTS_AND_PREMIUM_PLAN.md. */}
              <Pressable
                onPress={() => {
                  haptics.selection();
                  router.push("/login");
                }}
                accessibilityRole="link"
                style={styles.signInLink}
                hitSlop={8}
              >
                <Text style={styles.signInText}>
                  {t("signup_already_have_account")}{" "}
                  <Text style={styles.signInTextBold}>{t("login_submit")}</Text>
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <View style={styles.formBlock}>
                <Text style={styles.title}>{t("signup_title")}</Text>
                <Text style={styles.body}>{t("signup_body")}</Text>

                <Text style={styles.label}>{t("signup_first_name_label")}</Text>
                <TextInput
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder={t("signup_first_name_label")}
                  placeholderTextColor="#8E96A8"
                  style={styles.input}
                  autoFocus
                  autoCapitalize="words"
                  autoCorrect={false}
                  textContentType="givenName"
                  returnKeyType="next"
                  editable={!submitting}
                  maxLength={50}
                />

                <Text style={styles.label}>{t("signup_last_name_label")}</Text>
                <TextInput
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder={t("signup_last_name_label")}
                  placeholderTextColor="#8E96A8"
                  style={styles.input}
                  autoCapitalize="words"
                  autoCorrect={false}
                  textContentType="familyName"
                  returnKeyType="next"
                  editable={!submitting}
                  maxLength={50}
                />

                <Text style={styles.label}>{t("signup_dob_label")}</Text>
                <View style={styles.dobRow}>
                  <TextInput
                    value={birthMonth}
                    onChangeText={setBirthMonth}
                    placeholder="MM"
                    placeholderTextColor="#8E96A8"
                    style={[styles.input, styles.dobInputSmall]}
                    keyboardType="number-pad"
                    returnKeyType="next"
                    editable={!submitting}
                    maxLength={2}
                    textAlign="center"
                  />
                  <Text style={styles.dobSeparator}>/</Text>
                  <TextInput
                    value={birthDay}
                    onChangeText={setBirthDay}
                    placeholder="DD"
                    placeholderTextColor="#8E96A8"
                    style={[styles.input, styles.dobInputSmall]}
                    keyboardType="number-pad"
                    returnKeyType="next"
                    editable={!submitting}
                    maxLength={2}
                    textAlign="center"
                  />
                  <Text style={styles.dobSeparator}>/</Text>
                  <TextInput
                    value={birthYear}
                    onChangeText={setBirthYear}
                    placeholder="YYYY"
                    placeholderTextColor="#8E96A8"
                    style={[styles.input, styles.dobInputLarge]}
                    keyboardType="number-pad"
                    returnKeyType="next"
                    editable={!submitting}
                    maxLength={4}
                    textAlign="center"
                  />
                </View>

                <Text style={styles.label}>{t("field_email_label")}</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor="#8E96A8"
                  style={styles.input}
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
                  placeholder={t("claim_account_password_placeholder")}
                  placeholderTextColor="#8E96A8"
                  style={styles.input}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="newPassword"
                  returnKeyType="done"
                  onSubmitEditing={submitSignup}
                  editable={!submitting}
                />
                <Text style={styles.passwordTip}>{t("signup_password_tip")}</Text>

                <View style={styles.checkboxWrap}>
                  <CheckboxRow
                    checked={rememberPasswordChecked}
                    onToggle={setRememberPasswordChecked}
                    label={t("login_remember_password_label")}
                    helper={t("login_remember_password_helper")}
                    disabled={submitting}
                  />
                </View>
              </View>

              <View style={styles.cta}>
                {submitting ? (
                  <View style={styles.submittingBlock}>
                    <ActivityIndicator color="#2A6CF6" />
                    <Text style={styles.submittingText}>{t("signup_submitting")}</Text>
                  </View>
                ) : (
                  <LargeButton
                    variant="hero"
                    label={t("signup_submit")}
                    onPress={submitSignup}
                    accessibilityLabel={t("signup_submit")}
                  />
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
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingBottom: 32,
  },
  brandRow: {
    paddingTop: 12,
    paddingBottom: 36,
    alignItems: "center",
  },
  brand: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 1,
    color: "#2A6CF6",
  },
  heroBlock: {
    flex: 1,
    justifyContent: "center",
  },
  formBlock: {
    paddingTop: 4,
  },
  title: {
    fontSize: 36,
    fontWeight: "700",
    color: "#1A1F2C",
    marginBottom: 18,
    lineHeight: 42,
  },
  body: {
    fontSize: 20,
    color: "#5A6173",
    lineHeight: 30,
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#5A6173",
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    minHeight: 60,
    backgroundColor: "#F6F7FB",
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingVertical: 14,
    fontSize: 20,
    color: "#1A1F2C",
  },
  dobRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  dobInputSmall: {
    flex: 1,
    paddingHorizontal: 8,
  },
  dobInputLarge: {
    flex: 1.6,
    paddingHorizontal: 8,
  },
  dobSeparator: {
    fontSize: 22,
    color: "#8E96A8",
    marginHorizontal: 8,
  },
  passwordTip: {
    fontSize: 14,
    color: "#5A6173",
    lineHeight: 20,
    marginTop: 10,
  },
  checkboxWrap: {
    marginTop: 18,
  },
  cta: {
    paddingTop: 24,
    alignItems: "center",
  },
  signInLink: {
    marginTop: 20,
    alignSelf: "center",
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  signInText: {
    fontSize: 16,
    color: "#5A6173",
    textAlign: "center",
  },
  signInTextBold: {
    color: "#2A6CF6",
    fontWeight: "700",
  },
  submittingBlock: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 96,
    gap: 12,
  },
  submittingText: {
    fontSize: 18,
    color: "#5A6173",
  },
});
