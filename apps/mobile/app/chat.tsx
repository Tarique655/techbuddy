import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentProps } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import * as Speech from "expo-speech";
import { Ionicons } from "@expo/vector-icons";

import {
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
        console.error("[chat] resume failed", err);
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
  }, [messages, device, initialSessionId, t]);

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
      language: language === "fr" ? "fr-CA" : "en-US",
      rate: 0.9,
    });
  }, [messages, settings.readAloud, language]);

  // Always stop any in-flight speech when the screen unmounts (back button,
  // navigation away). Avoids Buddy's voice continuing on Home.
  useEffect(() => {
    return () => {
      Speech.stop();
    };
  }, []);

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
      console.error("[chat] send failed", err);
      Alert.alert(
        t("alert_buddy_trouble_title"),
        t("alert_buddy_trouble_body"),
        [{ text: t("alert_ok") }]
      );
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
                console.error("[chat] mark resolved failed", err);
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
   * Camera button: ask permission → open the rear camera directly →
   * process the result. No intermediate chooser. The native camera UI
   * handles its own preview/confirm step.
   */
  async function handleTakePhoto() {
    if (isSending) return;
    haptics.selection();

    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        t("alert_camera_permission_title"),
        t("alert_camera_permission_body"),
        [{ text: t("alert_ok") }]
      );
      return;
    }

    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: false,
        // Rear camera by default — seniors are pointing at another screen.
        cameraType: ImagePicker.CameraType.back,
      });
    } catch (err) {
      console.error("[chat] camera failed", err);
      Alert.alert(t("alert_camera_open_title"), t("alert_camera_open_body"));
      return;
    }

    if (result.canceled || !result.assets?.[0]) return;
    await processAndSendImage(result.assets[0]);
  }

  /**
   * Gallery button: open the OS Photo Picker directly. This is how
   * seniors send screenshots.
   *
   * IMPORTANT: do NOT call `requestMediaLibraryPermissionsAsync` here.
   * On Android 13+ the system Photo Picker is permissionless and is
   * the correct photo-gallery experience. Requesting permission first
   * routes through the legacy Storage Access Framework, which presents
   * the file explorer instead — exactly the wrong UX for this button.
   */
  async function handlePickFromGallery() {
    if (isSending) return;
    haptics.selection();

    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        allowsEditing: false,
        selectionLimit: 1,
      });
    } catch (err) {
      console.error("[chat] gallery failed", err);
      Alert.alert(t("alert_gallery_open_title"), t("alert_camera_open_body"));
      return;
    }

    if (result.canceled || !result.assets?.[0]) return;
    await processAndSendImage(result.assets[0]);
  }

  /**
   * Shared post-pick path: resize, base64-encode, and hand off to sendTurn.
   * Used by both the camera and gallery flows so they have identical
   * upload behavior.
   */
  async function processAndSendImage(
    asset: ImagePicker.ImagePickerAsset
  ): Promise<void> {
    setIsSending(true);
    try {
      // Resize so we don't ship a 4000×3000 photo to Claude. 1600px on
      // the long edge keeps text readable while compressing 3–5×.
      const resized = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 1600 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
      );

      const base64 = await FileSystem.readAsStringAsync(resized.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Hand off to the shared turn-sender. setIsSending(false) inside it
      // would race with our own true above, so unset here first.
      setIsSending(false);
      await sendTurn({
        text: input,
        image: { base64, mediaType: "image/jpeg" },
        imageUri: resized.uri,
      });
    } catch (err) {
      console.error("[chat] photo prep failed", err);
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
            <Bubble bubble={item} fontScale={settings.fontScale} />
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

        <View style={styles.composer}>
          <Pressable
            onPress={handlePickFromGallery}
            disabled={isSending}
            accessibilityRole="button"
            accessibilityLabel={t("gallery_a11y")}
            style={({ pressed }) => [
              styles.iconButton,
              isSending && styles.iconButtonDisabled,
              pressed && styles.iconButtonPressed,
            ]}
          >
            <Ionicons name="images-outline" size={26} color="#2A6CF6" />
          </Pressable>

          <Pressable
            onPress={handleTakePhoto}
            disabled={isSending}
            accessibilityRole="button"
            accessibilityLabel={t("camera_a11y")}
            style={({ pressed }) => [
              styles.iconButton,
              isSending && styles.iconButtonDisabled,
              pressed && styles.iconButtonPressed,
            ]}
          >
            <Ionicons name="camera" size={28} color="#2A6CF6" />
          </Pressable>

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
                styles.sendButton,
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
                styles.sendButton,
                isSending && styles.sendButtonDisabled,
                pressed && styles.sendButtonPressed,
              ]}
            >
              <Text style={styles.sendButtonText}>{t("send")}</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={handleStartVoice}
              disabled={isSending || voice.state === "starting"}
              accessibilityRole="button"
              accessibilityLabel={t("mic_a11y")}
              style={({ pressed }) => [
                styles.sendButton,
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
  iconButton: {
    minHeight: 52,
    minWidth: 52,
    borderRadius: 18,
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
  sendButton: {
    minHeight: 56,
    minWidth: 80,
    paddingHorizontal: 20,
    borderRadius: 20,
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
  sendButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
  stopButton: {
    backgroundColor: "#C8312D",
  },
  inputListening: {
    backgroundColor: "#FFF3F2",
    borderWidth: 2,
    borderColor: "#C8312D",
  },
});
