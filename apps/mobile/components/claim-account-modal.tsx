import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { ApiError, claimAccount } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useHaptics } from "@/lib/haptics";
import { safeErrorMessage } from "@/lib/safe-error";

type Props = {
  visible: boolean;
  onClose: () => void;
};

/**
 * "Add email & password" — the upgrade path for an existing anonymous
 * (name-only) senior account. See ACCOUNTS_AND_PREMIUM_PLAN.md §2.3/2.5.
 *
 * Critically, this does NOT create a new account or new session — it
 * attaches credentials to the CURRENT one via POST /v1/auth/claim, so chat
 * history, family links, everything stays exactly where it was. On
 * success we patch the in-memory user via updateUser() so Settings
 * immediately shows the new email without a re-login.
 */
export function ClaimAccountModal({ visible, onClose }: Props) {
  const { updateUser } = useAuth();
  const haptics = useHaptics();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function reset() {
    setEmail("");
    setPassword("");
    setSubmitting(false);
    setError(null);
    setDone(false);
  }

  function handleClose() {
    haptics.selection();
    reset();
    onClose();
  }

  async function submit() {
    const trimmed = email.trim();
    if (!trimmed || password.length < 8 || submitting) return;
    haptics.selection();
    setSubmitting(true);
    setError(null);
    try {
      const user = await claimAccount({ email: trimmed, password });
      updateUser({ email: user.email });
      setDone(true);
      haptics.notificationSuccess();
    } catch (err) {
      console.error("[claim-account] failed", safeErrorMessage(err));
      setError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {done ? (
            <>
              <Text style={styles.title}>You're all set</Text>
              <Text style={styles.body}>
                Your email is saved. We've also sent a confirmation link — no
                need to act on it right away.
              </Text>
              <Pressable
                onPress={handleClose}
                accessibilityRole="button"
                style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
              >
                <Text style={styles.primaryButtonText}>Done</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.title}>Add email & password</Text>
              <Text style={styles.body}>
                This lets you sign back in if you ever get a new phone. Your
                chat history stays exactly as it is.
              </Text>

              <Text style={styles.label}>Email</Text>
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
                editable={!submitting}
              />

              <Text style={styles.label}>Password</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="At least 8 characters"
                placeholderTextColor="#8E96A8"
                style={styles.input}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                editable={!submitting}
                onSubmitEditing={submit}
                returnKeyType="done"
              />

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              {submitting ? (
                <View style={styles.loadingWrap}>
                  <ActivityIndicator color="#2A6CF6" />
                </View>
              ) : (
                <Pressable
                  onPress={submit}
                  accessibilityRole="button"
                  disabled={!email.trim() || password.length < 8}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && styles.primaryButtonPressed,
                    (!email.trim() || password.length < 8) && styles.primaryButtonDisabled,
                  ]}
                >
                  <Text style={styles.primaryButtonText}>Save</Text>
                </Pressable>
              )}

              <Pressable
                onPress={handleClose}
                accessibilityRole="button"
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
              >
                <Text style={styles.secondaryButtonText}>Not now</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 480,
  },
  title: { fontSize: 22, fontWeight: "700", color: "#1A1F2C", marginBottom: 10, textAlign: "center" },
  body: { fontSize: 15, lineHeight: 21, color: "#5A6173", textAlign: "center", marginBottom: 18 },
  label: { fontSize: 14, fontWeight: "600", color: "#5A6173", marginBottom: 6, marginTop: 10 },
  input: {
    minHeight: 52,
    backgroundColor: "#F6F7FB",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 17,
    color: "#1A1F2C",
  },
  errorText: { color: "#C8312D", fontSize: 14, marginTop: 12, textAlign: "center" },
  loadingWrap: { paddingVertical: 14, alignItems: "center" },
  primaryButton: {
    backgroundColor: "#2A6CF6",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    marginTop: 20,
  },
  primaryButtonPressed: { opacity: 0.85 },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonText: { color: "#FFFFFF", fontSize: 17, fontWeight: "600" },
  secondaryButton: {
    backgroundColor: "#F1F4FB",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    marginTop: 10,
  },
  secondaryButtonPressed: { backgroundColor: "#E4ECFB" },
  secondaryButtonText: { color: "#1A1F2C", fontSize: 17, fontWeight: "600" },
});
