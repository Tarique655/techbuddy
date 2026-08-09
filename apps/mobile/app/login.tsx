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
import { ApiError, login } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useHaptics } from "@/lib/haptics";
import { safeErrorMessage } from "@/lib/safe-error";

/**
 * Email + password sign-in for a returning senior (new device, reinstall,
 * or anyone who's claimed their account — see ACCOUNTS_AND_PREMIUM_PLAN.md).
 *
 * NOTE: copy on this screen is English-only for now. The rest of the app
 * goes through lib/i18n's en/fr/es tables; extending that to the new
 * account screens is tracked as follow-up in TECH_DEBT.md rather than
 * done inline here, so as not to hand-translate untested copy.
 */
export default function LoginScreen() {
  const router = useRouter();
  const { setSession } = useAuth();
  const haptics = useHaptics();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password || submitting) return;

    haptics.selection();
    setSubmitting(true);
    try {
      const { user, token } = await login({ email: trimmedEmail, password });
      // AuthGate redirects automatically once setSession writes state.
      setSession({ user: { id: user.id, name: user.name, email: user.email }, token });
    } catch (err) {
      setSubmitting(false);
      const message =
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Please try again.";
      console.error("[login] failed", safeErrorMessage(err));
      Alert.alert("Couldn't sign in", message, [{ text: "OK" }]);
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
            accessibilityLabel="Back"
            style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
            hitSlop={12}
          >
            <Text style={styles.backArrow}>‹</Text>
            <Text style={styles.backText}>Back</Text>
          </Pressable>

          <View style={styles.heroBlock}>
            <Text style={styles.title}>Sign in</Text>
            <Text style={styles.body}>
              Enter the email and password you set up for TechBuddy.
            </Text>

            <Text style={styles.label}>Email</Text>
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

            <Text style={styles.label}>Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
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

            <Pressable
              onPress={() => {
                haptics.selection();
                router.push("/forgot-password");
              }}
              accessibilityRole="link"
              style={styles.forgotLink}
              hitSlop={8}
            >
              <Text style={styles.forgotText}>Forgot your password?</Text>
            </Pressable>
          </View>

          <View style={styles.cta}>
            {submitting ? (
              <View style={styles.submittingBlock}>
                <ActivityIndicator color="#2A6CF6" />
                <Text style={styles.submittingText}>Signing you in…</Text>
              </View>
            ) : (
              <LargeButton label="Sign in" onPress={submit} variant="hero" />
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
  forgotLink: { marginTop: 18, alignSelf: "flex-start", minHeight: 44, justifyContent: "center" },
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
