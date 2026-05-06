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

import { LargeButton } from "@/components/large-button";
import { createUser } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { useHaptics } from "@/lib/haptics";
import { safeErrorMessage } from "@/lib/safe-error";

type Step = "welcome" | "name";

export default function OnboardingScreen() {
  const { t } = useT();
  const { setSession } = useAuth();
  const haptics = useHaptics();

  const [step, setStep] = useState<Step>("welcome");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submitName() {
    const trimmed = name.trim();
    if (!trimmed || submitting) return;

    haptics.selection();
    setSubmitting(true);
    try {
      // /v1/users now returns { user, token }. The token is a freshly
      // minted JWT scoped to the mobile audience — persisting it here
      // means the very first authed call after onboarding (the
      // chat/sessions hydration) goes via Bearer, not legacy header.
      const { user, token } = await createUser({ name: trimmed });
      // Once setSession writes to SecureStore, AuthGate redirects to /
      // automatically — no need for router.replace here.
      setSession({
        user: { id: user.id, name: user.name },
        token,
      });
    } catch (err) {
      console.error("[onboarding] createUser failed", safeErrorMessage(err));
      setSubmitting(false);
      Alert.alert(t("onboarding_error_title"), t("onboarding_error_body"), [
        { text: t("onboarding_retry") },
      ]);
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
                    setStep("name");
                  }}
                />
              </View>
            </>
          ) : (
            <>
              <View style={styles.heroBlock}>
                <Text style={styles.title}>{t("onboarding_name_title")}</Text>
                <Text style={styles.body}>{t("onboarding_name_body")}</Text>

                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder={t("onboarding_name_placeholder")}
                  placeholderTextColor="#8E96A8"
                  style={styles.input}
                  autoFocus
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={submitName}
                  editable={!submitting}
                  maxLength={80}
                />
              </View>

              <View style={styles.cta}>
                {submitting ? (
                  <View style={styles.submittingBlock}>
                    <ActivityIndicator color="#2A6CF6" />
                    <Text style={styles.submittingText}>
                      {t("onboarding_creating")}
                    </Text>
                  </View>
                ) : (
                  <LargeButton
                    variant="hero"
                    label={t("onboarding_name_cta")}
                    onPress={submitName}
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
  input: {
    minHeight: 64,
    backgroundColor: "#F6F7FB",
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 22,
    color: "#1A1F2C",
    marginTop: 12,
  },
  cta: {
    paddingTop: 24,
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
