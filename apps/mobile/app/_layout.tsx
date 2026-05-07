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
import { SettingsProvider, useSettings } from "@/lib/settings";
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://9867d2b221e97a8f4495a69eac6583b8@o4511332839325696.ingest.us.sentry.io/4511332857217024',

  // Privacy-first: do NOT auto-attach IPs, cookies, device fingerprint,
  // or user objects to events. Anything we want Sentry to know we attach
  // explicitly via tags/extras (and even then we hash user ids — see the
  // diagnostic button in settings.tsx). Senior-facing app, low tolerance
  // for personal-data leakage by accident.
  // https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: false,

  // Enable Logs
  enableLogs: false,

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

/**
 * Root layout for the TechBuddy mobile app.
 *
 * Senior-facing: deliberately light theme only — no auto dark mode.
 * Seniors often have system theme preferences set unintentionally and
 * dark/light flipping is a usability problem we want to avoid.
 */
export default Sentry.wrap(function RootLayout() {
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
});

/**
 * Routes between /onboarding, /tutorial, and the rest of the app based on
 * auth + settings state.
 *
 * - While `ready` is false on either provider (AsyncStorage hydration), show
 *   a brand splash so we don't flash a wrong screen.
 * - Once both are ready:
 *     - No user → /onboarding
 *     - User but tutorial not yet seen → /tutorial (first-run mode)
 *     - User + tutorial seen but stuck on /onboarding or first-run /tutorial
 *       → /
 *
 * The Settings replay flow uses /tutorial?replay=1 — that param keeps the
 * gate from re-redirecting them out, since `tutorialSeen` is already true
 * when they get there.
 */
function AuthGate({ children }: { children: ReactNode }) {
  const { ready: authReady, user } = useAuth();
  const { ready: settingsReady, settings } = useSettings();
  const router = useRouter();
  const segments = useSegments();

  const ready = authReady && settingsReady;

  useEffect(() => {
    if (!ready) return;
    const inOnboarding = segments[0] === "onboarding";
    const inTutorial = segments[0] === "tutorial";

    if (!user) {
      if (!inOnboarding) router.replace("/onboarding");
      return;
    }

    // Authenticated from here on.
    if (!settings.tutorialSeen) {
      // Don't bounce them out of the tutorial they're already in. The
      // tutorial screen itself flips `tutorialSeen` and replaces the route
      // when finished/skipped, so this branch becomes a no-op afterward.
      if (!inTutorial) router.replace("/tutorial");
      return;
    }

    // Tutorial already seen.
    if (inOnboarding) router.replace("/");
    // We deliberately don't redirect away from /tutorial here — the senior
    // may have opened it via the Settings replay link, in which case we
    // want them to stay until they tap Done or close.
  }, [ready, user, settings.tutorialSeen, segments, router]);

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
