import { useEffect, type ReactNode } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";

import { AuthProvider, useAuth } from "@/lib/auth";
import { LanguageProvider } from "@/lib/i18n";
import { SettingsProvider } from "@/lib/settings";

/**
 * Root layout for the TechBuddy mobile app.
 *
 * Senior-facing: deliberately light theme only — no auto dark mode.
 * Seniors often have system theme preferences set unintentionally and
 * dark/light flipping is a usability problem we want to avoid.
 */
export default function RootLayout() {
  return (
    <LanguageProvider>
      <SettingsProvider>
        <AuthProvider>
          <AuthGate>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: "#FFFFFF" },
              }}
            />
            <StatusBar style="dark" />
          </AuthGate>
        </AuthProvider>
      </SettingsProvider>
    </LanguageProvider>
  );
}

/**
 * Routes between /onboarding and the rest of the app based on auth state.
 *
 * - While `ready` is false (AsyncStorage hydration), show a brand splash so
 *   we don't flash a wrong screen.
 * - Once `ready`, if there's no user and we're not already on /onboarding,
 *   redirect there. Conversely, if a user exists and we're stuck on
 *   /onboarding (e.g. after just completing it), bounce to /.
 */
function AuthGate({ children }: { children: ReactNode }) {
  const { ready, user } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (!ready) return;
    const inOnboarding = segments[0] === "onboarding";
    if (!user && !inOnboarding) {
      router.replace("/onboarding");
    } else if (user && inOnboarding) {
      router.replace("/");
    }
  }, [ready, user, segments, router]);

  if (!ready) {
    return (
      <View style={styles.splash}>
        <Text style={styles.splashBrand}>TECHBUDDY</Text>
        <ActivityIndicator color="#2A6CF6" style={styles.splashSpinner} />
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  splashBrand: {
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: "#2A6CF6",
  },
  splashSpinner: {
    marginTop: 24,
  },
});
