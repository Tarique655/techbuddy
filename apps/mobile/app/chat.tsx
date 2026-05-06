import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentProps } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Speech from "expo-speech";
import { Ionicons } from "@expo/vector-icons";

import {
  BuddyBusyError,
  getSession,
  sendChatMessage,
  updateSessionStatus,
  type ChatMessage,
  type DeviceKey,
  type ImageInput,
} from "@/lib/api";
import { renderContent } from "@/lib/inline-icons";
import { useT, type StringKey } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { useHaptics } from "@/lib/haptics";
import { useAuth } from "@/lib/auth";
import { useVoiceInput } from "@/lib/use-voice-input";
import { useBestSpeechVoice } from "@/lib/use-best-voice";
import { safeErrorMessage } from "@/lib/safe-error";
import {
  pickFromGalleryAndEncode,
  takePhotoAndEncode,
  type PickedImage,
} from "@/lib/pick-and-encode-image";
import { BugReportModal } from "@/components/bug-report-modal";

type Bubble = ChatMessage & {
  id: string;
  isGreeting?: boolean;
  /**
   * Local URI for an image attached to a user bubble. Set client-side only —
   * never persisted to the DB in v1, so it disappears after the session ends.
   */
  imageUri?: string;
};

const VALID_DEVICES: ReadonlySet<DeviceKey> = new Set([
  "computer",
  "phone",
  "tablet",
  "tv",
  "printer",
  "wifi",
  "other",
]);

const DEVICE_NOUN_KEY: Record<Exclude<DeviceKey, "other">, StringKey> = {
  computer: "noun_computer",
  phone: "noun_phone",
  tablet: "noun_tablet",
  tv: "noun_tv",
  printer: "noun_printer",
  wifi: "noun_wifi",
};

function buildGreeting(
  t: (key: StringKey, vars?: Record<string, string | number>) => string,
  name: string,
  device?: DeviceKey
): string {
  if (!device || device === "other") {
    return t("buddy_greet_generic", { name });
  }
  return t("buddy_greet_device", {
    name,
    device: t(DEVICE_NOUN_KEY[device]),
  });
}

type ChipDef = {
  labelKey: StringKey;
  icon: ComponentProps<typeof Ionicons>["name"];
};

/**
 * Quick-tap issue chips shown on a fresh chat. Tapping one auto-sends the
 * label as the senior's first message — no typing required to start.
 *
 * Three chips per device: the most common issues seniors actually run into
 * with that specific device. The "other" / no-device case falls back to a
 * general set covering passwords / pop-ups / email.
 */
const CHIPS_BY_DEVICE: Record<DeviceKey, ReadonlyArray<ChipDef>> = {
  computer: [
    { labelKey: "chip_computer_signin", icon: "lock-closed-outline" },
    { labelKey: "chip_computer_suspicious", icon: "alert-circle-outline" },
    { labelKey: "chip_computer_slow", icon: "hourglass-outline" },
  ],
  phone: [
    { labelKey: "chip_phone_app_crash", icon: "close-circle-outline" },
    { labelKey: "chip_phone_video_call", icon: "videocam-outline" },
    { labelKey: "chip_phone_password", icon: "lock-closed-outline" },
  ],
  tablet: [
    { labelKey: "chip_tablet_app_crash", icon: "close-circle-outline" },
    { labelKey: "chip_tablet_password", icon: "lock-closed-outline" },
    { labelKey: "chip_tablet_email", icon: "mail-outline" },
  ],
  tv: [
    { labelKey: "chip_tv_streaming", icon: "play-circle-outline" },
    { labelKey: "chip_tv_remote", icon: "game-controller-outline" },
    { labelKey: "chip_tv_signin", icon: "lock-closed-outline" },
  ],
  printer: [
    { labelKey: "chip_printer_no_print", icon: "print-outline" },
    { labelKey: "chip_printer_offline", icon: "cloud-offline-outline" },
    { labelKey: "chip_printer_paper_ink", icon: "color-palette-outline" },
  ],
  wifi: [
    { labelKey: "chip_wifi_connect", icon: "wifi-outline" },
    { labelKey: "chip_wifi_slow", icon: "hourglass-outline" },
    { labelKey: "chip_wifi_drop", icon: "alert-circle-outline" },
  ],
  other: [
    { labelKey: "chip_other_password", icon: "lock-closed-outline" },
    { labelKey: "chip_other_popup", icon: "alert-circle-outline" },
    { labelKey: "chip_other_email", icon: "mail-outline" },
    { labelKey: "chip_other_printer", icon: "print-outline" },
  ],
};

export default function ChatScreen() {
  const router = useRouter();
  const { t, language } = useT();
  const { settings } = useSettings();
  const haptics = useHaptics();
  const { user } = useAuth();
  const seniorName = user?.name ?? "";
  const voice = useVoiceInput(language);
  // Best-quality system TTS voice for the senior's chosen language.
  // Null while loading or if no enhanced voice is installed; in either
  // case Speech.speak below falls back to the OS default.
  const speakVoiceId = useBestSpeechVoice(language);
  const listRef = useRef<FlatList<Bubble>>(null);

  // Two ways to land on this screen:
  //   1. Fresh session  → /chat?device=<key>          (from device picker)
  //   2. Resumed session → /chat?sessionId=<id>       (from Home card)
  const params = useLocalSearchParams<{
    device?: string;
    sessionId?: string;
  }>();
  const initialDevice: DeviceKey | undefined =
    params.device && VALID_DEVICES.has(params.device as DeviceKey)
      ? (params.device as DeviceKey)
      : undefined;
  const initialSessionId =
    typeof params.sessionId === "string" && params.sessionId.length > 0
      ? params.sessionId
      : undefined;

  // Locally we attach optional `imageUri` to user messages so the bubble
  // can render the photo. The wire format strips this before send.
  type LocalMessage = ChatMessage & { imageUri?: string };

  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [device, setDevice] = useState<DeviceKey | undefined>(initialDevice);
  // Returned by the backend on the first send (or seeded from route params
  // when resuming). Held for the rest of the conversation so subsequent
  // turns append to the same session.
  const [sessionId, setSessionId] = useState<string | undefined>(
    initialSessionId
  );
  // True while we're loading a resumed session's history. Suppresses the
  // greeting bubble during load so we don't flash it before the real
  // history appears.
  const [isHydrating, setIsHydrating] = useState<boolean>(!!initialSessionId);

  // Visibility for the "How to take a screenshot" help modal, opened from
  // the small underlined link beneath Buddy's greeting bubble. The modal
  // shows device-aware instructions (iOS vs Android for the phone, etc.).
  const [screenshotHelpVisible, setScreenshotHelpVisible] = useState(false);

  // Visibility for the "Report a bug" modal, opened from the small red
  // underlined link above the composer.
  const [bugReportVisible, setBugReportVisible] = useState(false);

  // Rehydrate when arriving with a sessionId (from a Home card tap).
  useEffect(() => {
    if (!initialSessionId) return;
    let cancelled = false;
    getSession(initialSessionId)
      .then((session) => {
        if (cancelled) return;
        setMessages(
          session.messages.map((m) => ({ role: m.role, content: m.content }))
        );
        if (session.device) setDevice(session.device);
      })
      .catch((err: unknown) => {
        console.error("[chat] resume failed", safeErrorMessage(err));
        Alert.alert(
          t("alert_session_open_title"),
          t("alert_session_open_body"),
          [{ text: t("alert_ok"), onPress: () => router.back() }]
        );
      })
      .finally(() => {
        if (!cancelled) setIsHydrating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialSessionId, router, t]);

  // Greeting lives only in the rendered list — never sent to the API
  // (Anthropic requires the conversation to start with a user message).
  // On a resumed session we skip the greeting entirely; the persisted
  // history already starts at the senior's first real turn.
  const bubbles = useMemo<Bubble[]>(() => {
    const turns: Bubble[] = messages.map((m, i) => ({ ...m, id: `m-${i}` }));
    if (initialSessionId) return turns;
    const greeting: Bubble = {
      id: "greeting",
      role: "assistant",
      content: buildGreeting(t, seniorName, device),
      isGreeting: true,
    };
    return [greeting, ...turns];
    // seniorName is captured by buildGreeting — including it here keeps
    // the memo honest if a future "edit your name" flow lets the senior
    // change it mid-session. Same reason language is in the dep list:
    // buildGreeting uses t() which is language-bound.
  }, [messages, device, initialSessionId, t, seniorName]);

  // Scroll to bottom whenever messages or sending state changes.
  useEffect(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, [bubbles.length, isSending]);

  // Read-aloud: speak Buddy's latest reply via the OS TTS engine. Tracks
  // the last spoken message index in a ref so we never repeat. Strips icon
  // markers (e.g. [icon:refresh]) before speaking — TTS would say "open
  // bracket icon colon refresh close bracket" otherwise.
  const lastSpokenIndexRef = useRef<number>(-1);
  useEffect(() => {
    if (!settings.readAloud) {
      Speech.stop();
      return;
    }
    const idx = messages.length - 1;
    if (idx < 0 || idx === lastSpokenIndexRef.current) return;
    const last = messages[idx];
    if (last.role !== "assistant") return;

    lastSpokenIndexRef.current = idx;
    const speakable = last.content.replace(/\[icon:[a-z-]+\]/g, "").trim();
    if (!speakable) return;
    Speech.stop();
    Speech.speak(speakable, {
      // Pick the OS TTS locale that matches the senior's chosen language.
      // For French we use Canadian French (fr-CA) — closer to the accents
      // most TechBuddy users will recognize. For Spanish we use Spain
      // Spanish (es-ES) per product decision; if we ever ship Latin
      // American Spanish, branch on a more specific setting.
      language:
        language === "fr"
          ? "fr-CA"
          : language === "es"
            ? "es-ES"
            : "en-US",
      // Override the OS-default compact voice with the highest-quality
      // installed voice for this language (Premium > Enhanced > Default).
      // Undefined means "use the OS default" — same behavior as before
      // this hook existed, which is the right fallback.
      voice: speakVoiceId ?? undefined,
      // Slightly slower than normal for senior-friendly listening + a
      // touch above default pitch so the voice feels marginally warmer
      // and less monotone, especially on the older Default voices.
      rate: 0.9,
      pitch: 1.05,
    });
    // speakVoiceId is read inside the effect (the `voice:` option). If
    // the senior installs a higher-quality voice mid-session, the next
    // assistant turn should pick it up — without this dep, React would
    // skip re-running and we'd keep using the old voice id until the
    // next message change happened to coincide with a re-render.
  }, [messages, settings.readAloud, language, speakVoiceId]);

  // Always stop any in-flight speech when the screen unmounts (back button,
  // navigation away). Avoids Buddy's voice continuing on Home.
  useEffect(() => {
    return () => {
      Speech.stop();
    };
  }, []);

  // Stop both TTS and voice recognition when the app backgrounds. Without
  // this, leaving the app while Buddy is reading a reply (or the senior
  // is dictating) leaves the mic indicator / audio session active on
  // both platforms — disorienting for seniors and battery-wasteful.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "background" || next === "inactive") {
        Speech.stop();
        if (voice.state === "listening") {
          voice.stop();
        }
      }
    });
    return () => sub.remove();
  }, [voice]);

  // Pipe the live voice transcript into the composer's input field as the
  // senior speaks. While listening, every interim result replaces the text;
  // after auto-stop, the final transcript stays in the input so they can
  // edit before tapping Send.
  useEffect(() => {
    if (voice.state === "listening" && voice.transcript) {
      setInput(voice.transcript);
    }
  }, [voice.state, voice.transcript]);

  // Surface voice errors as friendly alerts. We deliberately ignore the
  // "permission_denied" code here because the user already saw the OS
  // prompt; only show our own alert when we have something extra to say.
  useEffect(() => {
    if (!voice.error) return;
    if (voice.error.code === "permission_denied") {
      Alert.alert(
        t("alert_mic_permission_title"),
        t("alert_mic_permission_body"),
        [{ text: t("alert_ok") }]
      );
    } else {
      Alert.alert(
        t("alert_voice_failed_title"),
        t("alert_voice_failed_body"),
        [{ text: t("alert_ok") }]
      );
    }
  }, [voice.error, t]);

  /** Senior tapped the mic. Kick off recognition. */
  function handleStartVoice() {
    if (isSending || voice.state !== "idle") return;
    haptics.selection();
    voice.start();
  }

  /** Senior tapped stop while listening. */
  function handleStopVoice() {
    if (voice.state !== "listening") return;
    haptics.selection();
    voice.stop();
  }

  /**
   * Send a turn. Either text-only (from the composer) or with an attached
   * photo (from the camera button). On photo turns we use a default text
   * if the input is empty so Buddy has something to anchor on.
   */
  async function sendTurn(opts: {
    text: string;
    image?: ImageInput;
    imageUri?: string;
  }) {
    if (isSending) return;
    const trimmed = opts.text.trim();
    const finalText =
      trimmed || (opts.image ? t("photo_default_caption") : "");
    if (!finalText) return;

    haptics.selection();

    const userMsg: LocalMessage = {
      role: "user",
      content: finalText,
      imageUri: opts.imageUri,
    };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setIsSending(true);

    try {
      // Strip UI-only fields before sending across the wire.
      const apiMessages: ChatMessage[] = next.map(({ role, content }) => ({
        role,
        content,
      }));
      const result = await sendChatMessage({
        messages: apiMessages,
        seniorName,
        device,
        sessionId,
        image: opts.image,
        language,
      });
      if (!sessionId) setSessionId(result.sessionId);
      setMessages([...next, result.message]);
    } catch (err) {
      console.error("[chat] send failed", safeErrorMessage(err));
      // Distinguish "Anthropic is overloaded — wait a few seconds and try
      // again" from "something is genuinely broken." Both produce the
      // same network-level fetch failure path on older builds; the new
      // BuddyBusyError lets us show calmer, more accurate copy.
      if (err instanceof BuddyBusyError) {
        Alert.alert(
          t("alert_buddy_busy_title"),
          t("alert_buddy_busy_body"),
          [{ text: t("alert_ok") }]
        );
      } else {
        Alert.alert(
          t("alert_buddy_trouble_title"),
          t("alert_buddy_trouble_body"),
          [{ text: t("alert_ok") }]
        );
      }
      // Roll back the user message we optimistically added so they can retry.
      setMessages(messages);
      setInput(trimmed);
    } finally {
      setIsSending(false);
    }
  }

  function handleSend() {
    if (!input.trim() || isSending) return;
    sendTurn({ text: input });
  }

  /**
   * Pick the right "how to take a screenshot" instructions based on the
   * device the senior said they need help with. For phone we branch on
   * Platform.OS so we describe the buttons of the device they're holding;
   * for tv/printer/wifi we redirect them to the camera button instead
   * (those devices can't actually take screenshots). For an unknown
   * device we fall back to instructions for this phone.
   */
  function getScreenshotInstructions(): string {
    switch (device) {
      case "phone":
        return Platform.OS === "ios"
          ? t("screenshot_help_phone_ios")
          : t("screenshot_help_phone_android");
      case "tablet":
        return t("screenshot_help_tablet");
      case "computer":
        return t("screenshot_help_computer");
      case "tv":
      case "printer":
      case "wifi":
        return t("screenshot_help_camera_only");
      default:
        return Platform.OS === "ios"
          ? t("screenshot_help_phone_ios")
          : t("screenshot_help_phone_android");
    }
  }

  function openScreenshotHelp() {
    haptics.selection();
    setScreenshotHelpVisible(true);
  }

  function closeScreenshotHelp() {
    haptics.selection();
    setScreenshotHelpVisible(false);
  }

  /**
   * Senior taps "Done" — confirm, mark the session resolved on the server,
   * navigate back. Resilient to backend errors: if the PATCH fails we still
   * navigate (the senior is leaving anyway), and the abandoned-sweep will
   * eventually catch the session.
   */
  function handleDone() {
    if (isSending) return;
    haptics.selection();

    Alert.alert(
      t("chat_done_title"),
      t("chat_done_body"),
      [
        { text: t("chat_done_no"), style: "cancel" },
        {
          text: t("chat_done_yes"),
          style: "default",
          onPress: async () => {
            if (sessionId) {
              try {
                await updateSessionStatus(sessionId, "resolved_ai");
              } catch (err) {
                console.error("[chat] mark resolved failed", safeErrorMessage(err));
              }
            }
            haptics.notificationSuccess();
            router.back();
          },
        },
      ],
      { cancelable: true }
    );
  }

  /**
   * Camera button: open the rear camera, encode the result, send. The
   * resize + base64 pipeline lives in lib/pick-and-encode-image.ts so
   * chat and bug-report-modal share one implementation.
   */
  async function handleTakePhoto() {
    if (isSending) return;
    haptics.selection();

    let result;
    try {
      result = await takePhotoAndEncode();
    } catch (err) {
      console.error("[chat] camera failed", safeErrorMessage(err));
      Alert.alert(t("alert_camera_open_title"), t("alert_camera_open_body"));
      return;
    }

    if (result.kind === "permission-denied") {
      Alert.alert(
        t("alert_camera_permission_title"),
        t("alert_camera_permission_body"),
        [{ text: t("alert_ok") }]
      );
      return;
    }
    if (result.kind === "cancelled") return;

    await sendImage(result.image);
  }

  /**
   * Gallery button: open the OS Photo Picker. Used for screenshots
   * the senior already saved. Permissionless on Android 13+ and on
   * iOS the system limited-Photos picker handles its own consent.
   */
  async function handlePickFromGallery() {
    if (isSending) return;
    haptics.selection();

    let result;
    try {
      result = await pickFromGalleryAndEncode();
    } catch (err) {
      console.error("[chat] gallery failed", safeErrorMessage(err));
      Alert.alert(t("alert_gallery_open_title"), t("alert_camera_open_body"));
      return;
    }

    if (result.kind === "cancelled") return;
    await sendImage(result.image);
  }

  /**
   * Shared post-pick path: hand off the encoded image to sendTurn.
   * Wraps the setIsSending dance so the picker handlers stay simple.
   */
  async function sendImage(image: PickedImage): Promise<void> {
    setIsSending(true);
    try {
      // setIsSending(false) inside sendTurn would race with our true
      // above, so unset here first.
      setIsSending(false);
      await sendTurn({
        text: input,
        image: image.payload,
        imageUri: image.uri,
      });
    } catch (err) {
      console.error("[chat] photo send failed", safeErrorMessage(err));
      Alert.alert(t("alert_photo_send_title"), t("alert_photo_send_body"));
      setIsSending(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t("back_a11y")}
          style={({ pressed }) => [
            styles.backButton,
            pressed && styles.backButtonPressed,
          ]}
          hitSlop={12}
        >
          <Text style={styles.backArrow}>‹</Text>
          <Text style={styles.backText}>{t("back")}</Text>
        </Pressable>

        <Text style={styles.headerTitle}>{t("chat_title")}</Text>

        {/*
          Right-side cluster: settings cog + Done. Both small enough that
          they fit alongside the back button without crowding. The cog sits
          to the LEFT of Done so it doesn't compete with Done as the
          primary positive action — Done stays the rightmost, most
          prominent element.
        */}
        <View style={styles.headerRight}>
          <Pressable
            onPress={() => {
              haptics.selection();
              router.push("/settings");
            }}
            accessibilityRole="button"
            accessibilityLabel={t("settings_a11y")}
            hitSlop={10}
            style={({ pressed }) => [
              styles.settingsButton,
              pressed && styles.settingsButtonPressed,
            ]}
          >
            <Ionicons name="settings-outline" size={22} color="#2A6CF6" />
          </Pressable>

          <Pressable
            onPress={handleDone}
            disabled={isSending}
            accessibilityRole="button"
            accessibilityLabel={t("done_a11y")}
            style={({ pressed }) => [
              styles.doneButton,
              isSending && styles.doneButtonDisabled,
              pressed && styles.doneButtonPressed,
            ]}
            hitSlop={12}
          >
            <Ionicons
              name="checkmark-circle"
              size={20}
              color="#1F8A4C"
              style={styles.doneIcon}
            />
            <Text style={styles.doneText}>{t("done")}</Text>
          </Pressable>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardWrap}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        {isHydrating ? (
          <View style={styles.hydratingWrap}>
            <ActivityIndicator size="large" color="#2A6CF6" />
            <Text style={styles.hydratingText}>{t("opening_chat")}</Text>
          </View>
        ) : (
        <FlatList
          ref={listRef}
          data={bubbles}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View>
              <Bubble bubble={item} fontScale={settings.fontScale} />
              {item.isGreeting ? (
                <Pressable
                  onPress={openScreenshotHelp}
                  accessibilityRole="link"
                  accessibilityLabel={t("screenshot_help_link_a11y")}
                  hitSlop={10}
                  style={({ pressed }) => [
                    styles.screenshotHelpLink,
                    pressed && styles.screenshotHelpLinkPressed,
                  ]}
                >
                  <Text style={styles.screenshotHelpLinkText}>
                    {t("screenshot_help_link")}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )}
          ListFooterComponent={
            isSending ? (
              <View style={styles.thinkingRow}>
                <ActivityIndicator size="small" color="#5A6173" />
                <Text style={styles.thinkingText} numberOfLines={1}>
                  {t("buddy_thinking")}
                </Text>
              </View>
            ) : messages.length === 0 && !initialSessionId ? (
              <IssueChips
                device={device}
                disabled={isSending}
                onPick={(label) => sendTurn({ text: label })}
              />
            ) : null
          }
          onContentSizeChange={() =>
            listRef.current?.scrollToEnd({ animated: true })
          }
        />
        )}

        {/*
          Small red underlined "Report a bug" link, positioned just above
          the composer. Stays out of the senior's primary chat flow but is
          available from any chat moment if Buddy or the app misbehaves.
        */}
        <Pressable
          onPress={() => {
            haptics.selection();
            setBugReportVisible(true);
          }}
          accessibilityRole="link"
          accessibilityLabel={t("bug_report_link_a11y")}
          hitSlop={10}
          style={({ pressed }) => [
            styles.bugReportLinkRow,
            pressed && styles.bugReportLinkRowPressed,
          ]}
        >
          <Text style={styles.bugReportLinkText}>{t("bug_report_link")}</Text>
        </Pressable>

        <View style={styles.composer}>
          {/*
            Camera + gallery stacked vertically as a slim column on the
            left. Compact 32×32 visual size with hitSlop expanding the
            tap zone to senior-friendly 48px+. Frees up horizontal room
            for the input.
          */}
          <View style={styles.iconColumn}>
            <Pressable
              onPress={handleTakePhoto}
              disabled={isSending}
              accessibilityRole="button"
              accessibilityLabel={t("camera_a11y")}
              hitSlop={10}
              style={({ pressed }) => [
                styles.iconButtonSmall,
                isSending && styles.iconButtonDisabled,
                pressed && styles.iconButtonPressed,
              ]}
            >
              <Ionicons name="camera" size={22} color="#2A6CF6" />
            </Pressable>
            <Pressable
              onPress={handlePickFromGallery}
              disabled={isSending}
              accessibilityRole="button"
              accessibilityLabel={t("gallery_a11y")}
              hitSlop={10}
              style={({ pressed }) => [
                styles.iconButtonSmall,
                isSending && styles.iconButtonDisabled,
                pressed && styles.iconButtonPressed,
              ]}
            >
              <Ionicons name="images-outline" size={20} color="#2A6CF6" />
            </Pressable>
          </View>

          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={
              voice.state === "listening"
                ? t("voice_listening_hint")
                : t("type_placeholder")
            }
            placeholderTextColor="#8E96A8"
            multiline
            style={[
              styles.input,
              { fontSize: 20 * settings.fontScale },
              voice.state === "listening" && styles.inputListening,
            ]}
            editable={!isSending && voice.state !== "listening"}
            accessibilityLabel={t("msg_input_a11y")}
          />
          {/*
            Adaptive primary button. Three states, same position:
              - listening    → red Stop button
              - has text     → blue Send button
              - empty + idle → blue Mic button
            One button, no decisions for the senior to make about which
            action to use.
          */}
          {voice.state === "listening" ? (
            <Pressable
              onPress={handleStopVoice}
              accessibilityRole="button"
              accessibilityLabel={t("mic_listening_a11y")}
              style={({ pressed }) => [
                styles.primaryCircle,
                styles.stopButton,
                pressed && styles.sendButtonPressed,
              ]}
            >
              <Ionicons name="stop" size={22} color="#FFFFFF" />
            </Pressable>
          ) : input.trim() ? (
            <Pressable
              onPress={handleSend}
              disabled={isSending}
              accessibilityRole="button"
              accessibilityLabel={t("send_a11y")}
              style={({ pressed }) => [
                styles.primaryCircle,
                isSending && styles.sendButtonDisabled,
                pressed && styles.sendButtonPressed,
              ]}
            >
              <Ionicons name="arrow-up" size={26} color="#FFFFFF" />
            </Pressable>
          ) : (
            <Pressable
              onPress={handleStartVoice}
              disabled={isSending || voice.state === "starting"}
              accessibilityRole="button"
              accessibilityLabel={t("mic_a11y")}
              style={({ pressed }) => [
                styles.primaryCircle,
                (isSending || voice.state === "starting") &&
                  styles.sendButtonDisabled,
                pressed && styles.sendButtonPressed,
              ]}
            >
              <Ionicons name="mic" size={26} color="#FFFFFF" />
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>

      {/*
        Screenshot help modal — opened from the small underlined link below
        Buddy's greeting. The body text is picked by getScreenshotInstructions
        so the steps match the device the senior is asking about.
      */}
      <Modal
        visible={screenshotHelpVisible}
        transparent
        animationType="fade"
        onRequestClose={closeScreenshotHelp}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text
              style={[
                styles.modalTitle,
                { fontSize: 22 * settings.fontScale },
              ]}
            >
              {t("screenshot_help_modal_title")}
            </Text>
            <ScrollView
              style={styles.modalBodyScroll}
              contentContainerStyle={styles.modalBodyContent}
              showsVerticalScrollIndicator={false}
            >
              <Text
                style={[
                  styles.modalBody,
                  {
                    fontSize: 18 * settings.fontScale,
                    lineHeight: 26 * settings.fontScale,
                  },
                ]}
              >
                {getScreenshotInstructions()}
              </Text>
            </ScrollView>
            <Pressable
              onPress={closeScreenshotHelp}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.modalButton,
                pressed && styles.modalButtonPressed,
              ]}
            >
              <Text style={styles.modalButtonText}>
                {t("screenshot_help_modal_close")}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <BugReportModal
        visible={bugReportVisible}
        onClose={() => setBugReportVisible(false)}
        screen="chat"
        sessionId={sessionId}
      />
    </SafeAreaView>
  );
}

/**
 * 2-column grid of quick-tap chips shown on a fresh chat. Disabled while a
 * send is in flight so the senior can't double-fire by tapping two chips.
 */
function IssueChips({
  device,
  onPick,
  disabled,
}: {
  device: DeviceKey | undefined;
  onPick: (label: string) => void;
  disabled: boolean;
}) {
  const { t } = useT();
  const issues = CHIPS_BY_DEVICE[device ?? "other"];
  return (
    <View style={styles.chipsWrap}>
      <Text style={styles.chipsHint}>{t("chips_hint")}</Text>
      <View style={styles.chipsGrid}>
        {issues.map((issue) => {
          const label = t(issue.labelKey);
          return (
            <Pressable
              key={issue.labelKey}
              disabled={disabled}
              onPress={() => onPick(label)}
              accessibilityRole="button"
              accessibilityLabel={label}
              style={({ pressed }) => [
                styles.chip,
                disabled && styles.chipDisabled,
                pressed && styles.chipPressed,
              ]}
            >
              <Ionicons name={issue.icon} size={22} color="#2A6CF6" />
              <Text style={styles.chipLabel} numberOfLines={2}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Bubble({
  bubble,
  fontScale,
}: {
  bubble: Bubble;
  fontScale: number;
}) {
  const isUser = bubble.role === "user";
  // Base text size from the design (20pt). Multiply by the senior's
  // chosen scale; line-height tracks the same multiplier so wrapping
  // stays balanced.
  const fontSize = 20 * fontScale;
  const lineHeight = 28 * fontScale;
  return (
    <View
      style={[
        styles.bubbleRow,
        isUser ? styles.bubbleRowRight : styles.bubbleRowLeft,
      ]}
    >
      <View
        style={[
          styles.bubble,
          isUser ? styles.bubbleUser : styles.bubbleBuddy,
        ]}
      >
        {bubble.imageUri ? (
          <Image
            source={{ uri: bubble.imageUri }}
            style={styles.bubbleImage}
            resizeMode="cover"
            accessibilityLabel="Photo you sent to Buddy"
          />
        ) : null}
        {bubble.content ? (
          <Text
            style={[
              styles.bubbleText,
              { fontSize, lineHeight },
              isUser ? styles.bubbleTextUser : styles.bubbleTextBuddy,
              bubble.imageUri ? styles.bubbleTextWithImage : null,
            ]}
          >
            {/* User bubbles render plain text — only Buddy emits icon markers. */}
            {isUser
              ? bubble.content
              : renderContent(bubble.content, fontSize, "#1A1F2C")}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E6E8EF",
    minHeight: 56,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    minWidth: 80,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  backButtonPressed: {
    backgroundColor: "#F0F2F8",
  },
  backArrow: {
    fontSize: 32,
    color: "#2A6CF6",
    marginRight: 4,
    lineHeight: 32,
    marginTop: -4,
  },
  backText: {
    fontSize: 18,
    color: "#2A6CF6",
    fontWeight: "500",
  },
  headerTitle: {
    flex: 1,
    fontSize: 22,
    fontWeight: "700",
    color: "#1A1F2C",
    textAlign: "center",
  },
  headerSpacer: {
    minWidth: 80,
  },
  // Right-side cluster: cog + Done sit side-by-side. Tight gap so they
  // don't drift apart at larger font scales; both keep their senior-
  // friendly tap targets via hitSlop.
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: "#F1F4FB",
    alignItems: "center",
    justifyContent: "center",
  },
  settingsButtonPressed: {
    backgroundColor: "#E4ECFB",
    transform: [{ scale: 0.96 }],
  },
  doneButton: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    minWidth: 80,
    paddingHorizontal: 12,
    borderRadius: 12,
    justifyContent: "center",
  },
  doneButtonPressed: {
    backgroundColor: "#E8F4EE",
  },
  doneButtonDisabled: {
    opacity: 0.4,
  },
  doneIcon: {
    marginRight: 4,
  },
  doneText: {
    fontSize: 18,
    color: "#1F8A4C",
    fontWeight: "600",
  },
  keyboardWrap: {
    flex: 1,
  },
  hydratingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  hydratingText: {
    fontSize: 18,
    color: "#5A6173",
  },
  listContent: {
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  bubbleRow: {
    marginVertical: 6,
    flexDirection: "row",
  },
  bubbleRowLeft: {
    justifyContent: "flex-start",
  },
  bubbleRowRight: {
    justifyContent: "flex-end",
  },
  bubble: {
    maxWidth: "82%",
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 20,
  },
  bubbleBuddy: {
    backgroundColor: "#F1F4FB",
    borderBottomLeftRadius: 6,
  },
  bubbleUser: {
    backgroundColor: "#2A6CF6",
    borderBottomRightRadius: 6,
  },
  bubbleText: {
    fontSize: 20,
    lineHeight: 28,
  },
  bubbleTextBuddy: {
    color: "#1A1F2C",
  },
  bubbleTextUser: {
    color: "#FFFFFF",
  },
  chipsWrap: {
    paddingTop: 12,
    paddingHorizontal: 4,
  },
  chipsHint: {
    fontSize: 16,
    color: "#5A6173",
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  chipsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 10,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "48.5%",
    minHeight: 64,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: "#F1F4FB",
  },
  chipPressed: {
    backgroundColor: "#E4ECFB",
    transform: [{ scale: 0.98 }],
  },
  chipDisabled: {
    opacity: 0.4,
  },
  chipLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: "#1A1F2C",
    lineHeight: 19,
  },
  thinkingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 18,
    gap: 10,
  },
  thinkingText: {
    flex: 1,
    fontSize: 18,
    color: "#5A6173",
    fontStyle: "italic",
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#E6E8EF",
    backgroundColor: "#FFFFFF",
    gap: 8,
  },
  // Slim vertical column on the left of the composer that holds the
  // camera + gallery icons stacked. Frees up horizontal room for the
  // text input compared to two side-by-side buttons.
  iconColumn: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
  },
  iconButtonSmall: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: "#F1F4FB",
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonPressed: {
    backgroundColor: "#E4ECFB",
  },
  iconButtonDisabled: {
    opacity: 0.4,
  },
  input: {
    flex: 1,
    minHeight: 56,
    maxHeight: 140,
    backgroundColor: "#F6F7FB",
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 14,
    fontSize: 20,
    color: "#1A1F2C",
  },
  bubbleImage: {
    width: 240,
    height: 320,
    borderRadius: 12,
    backgroundColor: "#1A1F2C",
  },
  bubbleTextWithImage: {
    marginTop: 10,
  },
  // Circular primary action button — adapts between Mic / Stop / Send
  // depending on composer state. Same position so the senior never has
  // to think about which button to tap.
  primaryCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#2A6CF6",
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    backgroundColor: "#B5C4E8",
  },
  sendButtonPressed: {
    opacity: 0.85,
  },
  stopButton: {
    backgroundColor: "#C8312D",
  },
  inputListening: {
    backgroundColor: "#FFF3F2",
    borderWidth: 2,
    borderColor: "#C8312D",
  },

  // Small underlined link rendered just below Buddy's greeting bubble.
  // Sits a little inset from the left edge so it visually attaches to
  // the bubble above it without looking like a button.
  screenshotHelpLink: {
    paddingHorizontal: 18,
    paddingVertical: 6,
    marginTop: 2,
    marginLeft: 4,
    alignSelf: "flex-start",
  },
  screenshotHelpLinkPressed: {
    opacity: 0.55,
  },
  screenshotHelpLinkText: {
    fontSize: 15,
    color: "#2A6CF6",
    textDecorationLine: "underline",
    fontWeight: "500",
  },

  // Centered card-style modal for the screenshot instructions. Big enough
  // to fit the longest device variant comfortably; the body scrolls if
  // the senior has cranked the font scale up.
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 480,
    maxHeight: "85%",
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1A1F2C",
    marginBottom: 16,
  },
  modalBodyScroll: {
    flexGrow: 0,
    marginBottom: 20,
  },
  modalBodyContent: {
    paddingBottom: 4,
  },
  modalBody: {
    fontSize: 18,
    lineHeight: 26,
    color: "#1A1F2C",
  },
  modalButton: {
    backgroundColor: "#2A6CF6",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center",
  },
  modalButtonPressed: {
    opacity: 0.85,
  },
  modalButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },

  // Small red underlined "Report a bug" link, positioned just above the
  // composer. Center-aligned, low-visibility — stays out of the senior's
  // primary chat flow but is always reachable.
  bugReportLinkRow: {
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  bugReportLinkRowPressed: {
    opacity: 0.55,
  },
  bugReportLinkText: {
    fontSize: 14,
    color: "#C8312D",
    textDecorationLine: "underline",
    fontWeight: "500",
  },
});
