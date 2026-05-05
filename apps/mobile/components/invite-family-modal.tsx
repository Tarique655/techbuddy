import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { createFamilyInvite, type FamilyInvite } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { useHaptics } from "@/lib/haptics";

type Props = {
  visible: boolean;
  onClose: () => void;
};

/**
 * Family-portal URL the senior shares with the family member.
 *
 * Read from the `EXPO_PUBLIC_FAMILY_URL` env var when set so dev and prod
 * builds can point at different hosts; falls back to the live Vercel URL
 * for builds that didn't set it (which is fine — it IS the production URL).
 */
const FAMILY_PORTAL_URL =
  process.env.EXPO_PUBLIC_FAMILY_URL ?? "https://techbuddy-web.vercel.app";

/**
 * Senior taps "Invite a family member" in Settings → this modal pops up,
 * calls POST /v1/family/invites, displays the resulting 6-digit code in
 * very large type, and gives them a Share button so they can WhatsApp /
 * SMS / email it to family directly via the OS share sheet.
 *
 * Lifecycle:
 *   1. Modal opens → fire the API call.
 *   2. Show a spinner while it's in flight.
 *   3. On success → display the code + portal URL + Share / Done buttons.
 *   4. On error → show an error state with a Try Again button.
 *
 * The code is short-lived (7 days) and single-use; the senior can always
 * generate a new one by reopening this modal. We deliberately don't cache
 * across opens — each tap means a fresh code.
 */
export function InviteFamilyModal({ visible, onClose }: Props) {
  const { t } = useT();
  const { settings } = useSettings();
  const haptics = useHaptics();

  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "ready"; invite: FamilyInvite }
    | { status: "error" }
  >({ status: "idle" });

  // Mint a new invite every time the modal opens. Cleared on close so the
  // next open always shows a fresh spinner + new code.
  useEffect(() => {
    if (!visible) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    createFamilyInvite()
      .then((invite) => {
        if (cancelled) return;
        setState({ status: "ready", invite });
      })
      .catch((err: unknown) => {
        console.error("[invite-family] failed", err);
        if (cancelled) return;
        setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  function handleClose() {
    haptics.selection();
    onClose();
  }

  async function handleShare() {
    if (state.status !== "ready") return;
    haptics.selection();
    const message = t("invite_family_share_message", {
      code: state.invite.code,
      url: FAMILY_PORTAL_URL,
    });
    try {
      await Share.share({ message });
    } catch (err) {
      console.error("[invite-family] share failed", err);
    }
  }

  function handleRetry() {
    if (state.status === "loading") return;
    haptics.selection();
    setState({ status: "loading" });
    createFamilyInvite()
      .then((invite) => setState({ status: "ready", invite }))
      .catch((err: unknown) => {
        console.error("[invite-family] retry failed", err);
        setState({ status: "error" });
      });
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text
            style={[
              styles.title,
              { fontSize: 22 * settings.fontScale },
            ]}
          >
            {t("invite_family_modal_title")}
          </Text>

          {state.status === "loading" || state.status === "idle" ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color="#2A6CF6" />
              <Text
                style={[
                  styles.loadingText,
                  { fontSize: 16 * settings.fontScale },
                ]}
              >
                {t("invite_family_modal_loading")}
              </Text>
            </View>
          ) : state.status === "error" ? (
            <View style={styles.errorWrap}>
              <Ionicons
                name="alert-circle-outline"
                size={40}
                color="#C8312D"
                style={styles.errorIcon}
              />
              <Text
                style={[
                  styles.errorTitle,
                  { fontSize: 18 * settings.fontScale },
                ]}
              >
                {t("invite_family_modal_error_title")}
              </Text>
              <Text
                style={[
                  styles.errorBody,
                  {
                    fontSize: 16 * settings.fontScale,
                    lineHeight: 22 * settings.fontScale,
                  },
                ]}
              >
                {t("invite_family_modal_error_body")}
              </Text>
              <Pressable
                onPress={handleRetry}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.primaryButtonPressed,
                ]}
              >
                <Text style={styles.primaryButtonText}>
                  {t("onboarding_retry")}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.readyWrap}>
              <Text
                style={[
                  styles.body,
                  {
                    fontSize: 16 * settings.fontScale,
                    lineHeight: 22 * settings.fontScale,
                  },
                ]}
              >
                {t("invite_family_modal_body", { url: FAMILY_PORTAL_URL })}
              </Text>

              {/*
                The code itself — displayed extremely large and spaced out
                so the senior can read it from arm's length. This is the
                key affordance of the modal; everything else is supporting.
              */}
              <View style={styles.codeBlock}>
                <Text
                  style={styles.code}
                  accessibilityLabel={`Invite code: ${state.invite.code
                    .split("")
                    .join(" ")}`}
                >
                  {state.invite.code}
                </Text>
              </View>

              <Text
                style={[
                  styles.expiresNote,
                  { fontSize: 14 * settings.fontScale },
                ]}
              >
                {t("invite_family_modal_expires")}
              </Text>

              <Pressable
                onPress={handleShare}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.primaryButtonPressed,
                ]}
              >
                <Ionicons
                  name="share-outline"
                  size={20}
                  color="#FFFFFF"
                  style={styles.primaryButtonIcon}
                />
                <Text style={styles.primaryButtonText}>
                  {t("invite_family_share")}
                </Text>
              </Pressable>
            </View>
          )}

          <Pressable
            onPress={handleClose}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.secondaryButtonPressed,
            ]}
          >
            <Text style={styles.secondaryButtonText}>
              {t("invite_family_close")}
            </Text>
          </Pressable>
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
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1A1F2C",
    marginBottom: 16,
    textAlign: "center",
  },
  body: {
    fontSize: 16,
    lineHeight: 22,
    color: "#5A6173",
    textAlign: "center",
    marginBottom: 16,
  },
  loadingWrap: {
    paddingVertical: 32,
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
    color: "#5A6173",
  },
  errorWrap: {
    paddingVertical: 16,
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  errorIcon: {
    marginBottom: 4,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1A1F2C",
    textAlign: "center",
  },
  errorBody: {
    fontSize: 16,
    lineHeight: 22,
    color: "#5A6173",
    textAlign: "center",
    marginBottom: 12,
  },
  readyWrap: {
    alignItems: "center",
    marginBottom: 12,
  },
  // Massive code rendering. We deliberately use a monospace-feel by
  // letter-spacing so the digits can't visually run together. Background
  // tint sets it apart from the rest of the modal as the focal point.
  codeBlock: {
    backgroundColor: "#F1F4FB",
    borderRadius: 16,
    paddingVertical: 24,
    paddingHorizontal: 16,
    marginVertical: 8,
    width: "100%",
    alignItems: "center",
  },
  code: {
    fontSize: 48,
    fontWeight: "700",
    color: "#2A6CF6",
    letterSpacing: 8,
  },
  expiresNote: {
    fontSize: 14,
    color: "#8E96A8",
    marginBottom: 16,
    textAlign: "center",
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2A6CF6",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    minHeight: 48,
    minWidth: 180,
  },
  primaryButtonPressed: {
    opacity: 0.85,
  },
  primaryButtonIcon: {
    marginRight: 8,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "600",
  },
  secondaryButton: {
    backgroundColor: "#F1F4FB",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    marginTop: 12,
  },
  secondaryButtonPressed: {
    backgroundColor: "#E4ECFB",
  },
  secondaryButtonText: {
    color: "#1A1F2C",
    fontSize: 17,
    fontWeight: "600",
  },
});
