/**
 * "Remember me" storage for the login screen — separate from the auth
 * session itself (lib/auth.tsx) and the JWT (lib/auth-token.ts).
 *
 * Two independent things get remembered, per Tariq's product decision
 * (2026-08-09):
 *   - Email: ALWAYS remembered automatically after a successful
 *     signup/login, no opt-in. Prefills the login screen's email field.
 *     Low sensitivity — knowing an email address alone doesn't get
 *     anyone into the account.
 *   - Password: only remembered when the senior explicitly ticks
 *     "Remember my password" on the login screen. Explicit opt-in
 *     because unlike the email, this is real credential material — the
 *     trade-off (fewer things to type/forget vs. anyone with the
 *     unlocked phone can sign in) was discussed and chosen deliberately
 *     for this senior-facing app. See ACCOUNTS_AND_PREMIUM_PLAN.md.
 *
 * Both live in expo-secure-store (iOS Keychain / Android Keystore), same
 * backend as the auth session and JWT — never AsyncStorage, which is
 * plaintext on disk.
 *
 * All operations swallow errors and resolve anyway (SecureStore can fail
 * on e.g. a simulator without Keychain access) — remembering credentials
 * is a convenience, never something that should block sign-in/signup.
 */
import * as SecureStore from "expo-secure-store";

const EMAIL_KEY = "techbuddy.remembered.email.v1";
const PASSWORD_KEY = "techbuddy.remembered.password.v1";

export async function rememberEmail(email: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(EMAIL_KEY, email);
  } catch {
    /* best-effort */
  }
}

export async function getRememberedEmail(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(EMAIL_KEY);
  } catch {
    return null;
  }
}

export async function rememberPassword(password: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(PASSWORD_KEY, password);
  } catch {
    /* best-effort */
  }
}

export async function getRememberedPassword(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(PASSWORD_KEY);
  } catch {
    return null;
  }
}

/** Called when the "Remember my password" checkbox is unticked, or on
 *  sign-out — stop keeping the password around. */
export async function forgetPassword(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(PASSWORD_KEY);
  } catch {
    /* best-effort */
  }
}
