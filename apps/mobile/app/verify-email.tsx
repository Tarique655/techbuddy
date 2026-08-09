import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";

import { LargeButton } from "@/components/large-button";
import { verifyEmail } from "@/lib/api";
import { safeErrorMessage } from "@/lib/safe-error";

/**
 * Deep-link target for the verification email:
 * techbuddy://verify-email?token=<raw token>
 *
 * We deliberately don't gate app access on this (see
 * ACCOUNTS_AND_PREMIUM_PLAN.md §2.3) — this screen just confirms the
 * email and sends the senior back into the app either way.
 */
export default function VerifyEmailScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();
  const [state, setState] = useState<"checking" | "done" | "error">("checking");

  useEffect(() => {
    if (!token) {
      setState("error");
      return;
    }
    verifyEmail(token)
      .then(() => setState("done"))
      .catch((err) => {
        console.error("[verify-email] failed", safeErrorMessage(err));
        setState("error");
      });
  }, [token]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.center}>
        {state === "checking" ? (
          <ActivityIndicator color="#2A6CF6" size="large" />
        ) : state === "done" ? (
          <>
            <Text style={styles.title}>Email confirmed</Text>
            <Text style={styles.body}>Thanks — your email is verified.</Text>
          </>
        ) : (
          <>
            <Text style={styles.title}>Link expired</Text>
            <Text style={styles.body}>
              This confirmation link is no longer valid. You can request a new
              one from Settings.
            </Text>
          </>
        )}

        {state !== "checking" ? (
          <View style={styles.cta}>
            <LargeButton label="Continue" onPress={() => router.replace("/")} />
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFFFFF" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
  title: { fontSize: 28, fontWeight: "700", color: "#1A1F2C", marginTop: 20, marginBottom: 12, textAlign: "center" },
  body: { fontSize: 18, color: "#5A6173", lineHeight: 26, textAlign: "center" },
  cta: { paddingTop: 32 },
});
