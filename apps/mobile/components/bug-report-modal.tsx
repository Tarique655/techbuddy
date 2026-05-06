import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";

import { submitBugReport, type BugReportScreen, type ImageInput } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { useHaptics } from "@/lib/haptics";
import { safeErrorMessage } from "@/lib/safe-error";

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Where the senior was when they tapped "Report a bug". */
  screen: BugReportScreen;
  /** When reporting from chat, attach the active session id for context. */
  sessionId?: string;
};

type LocalImage = {
  /** Local file URI for the preview <Image>. */
  uri: string;
  /** Wire-format payload we'll POST to the API. */
  payload: ImageInput;
};

/**
 * Shared bug-report modal used from both the Home and Chat screens.
 *
 * Lifecycle:
 *   1. Senior types a description, optionally attaches a photo.
 *   2. Tap "Send report" → POST /v1/bug-reports.
 *   3. On success, swap the form for a brief "Thanks" confirmation, then
 *      auto-close after a short delay so the senior is back on their
 *      original screen without any further taps.
 *
 * Image handling mirrors the chat composer: take-photo or pick-from-gallery,
 * resize to 1600px on the long edge, JPEG q0.7, base64-encode for the wire.
 */
export function BugReportModal({ visible, onClose, screen, sessionId }: Props) {
  const { t, language } = useT();
  const { settings } = useSettings();
  const haptics = useHaptics();

  const [description, setDescription] = useState("");
  const [image, setImage] = useState<LocalImage | null>(null);
  const [sending, setSending] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const canSend = description.trim().length > 0 && !sending;

  function resetAndClose() {
    setDescription("");
    setImage(null);
    setSending(false);
    setShowSuccess(false);
    onClose();
  }

  function handleCancel() {
    haptics.selection();
    resetAndClose();
  }

  async function handleTakePhoto() {
    if (sending) return;
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
        cameraType: ImagePicker.CameraType.back,
      });
    } catch (err) {
      console.error("[bug-report] camera failed", safeErrorMessage(err));
      Alert.alert(t("alert_camera_open_title"), t("alert_camera_open_body"));
      return;
    }

    if (result.canceled || !result.assets?.[0]) return;
    await prepareImage(result.assets[0]);
  }

  async function handlePickFromGallery() {
    if (sending) return;
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
      console.error("[bug-report] gallery failed", safeErrorMessage(err));
      Alert.alert(t("alert_gallery_open_title"), t("alert_camera_open_body"));
      return;
    }

    if (result.canceled || !result.assets?.[0]) return;
    await prepareImage(result.assets[0]);
  }

  /**
   * Resize, encode, and stash an image so the user can preview it before
   * sending. Same processing pipeline as the chat composer.
   */
  async function prepareImage(asset: ImagePicker.ImagePickerAsset) {
    try {
      const resized = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 1600 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
      );
      const base64 = await FileSystem.readAsStringAsync(resized.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      setImage({
        uri: resized.uri,
        payload: { base64, mediaType: "image/jpeg" },
      });
    } catch (err) {
      console.error("[bug-report] image prep failed", safeErrorMessage(err));
      Alert.alert(t("alert_photo_send_title"), t("alert_photo_send_body"));
    }
  }

  function handleRemoveImage() {
    haptics.selection();
    setImage(null);
  }

  async function handleSend() {
    if (!canSend) return;
    haptics.selection();
    setSending(true);

    try {
      await submitBugReport({
        description: description.trim(),
        image: image?.payload,
        screen,
        sessionId,
        platform: Platform.OS,
        appVersion:
          Constants.expoConfig?.version ??
          (Constants as unknown as { manifest?: { version?: string } }).manifest
            ?.version,
        locale: language,
      });
      haptics.notificationSuccess();
      setShowSuccess(true);
      // Brief pause on the success state so the senior sees the
      // confirmation, then auto-close.
      setTimeout(() => {
        resetAndClose();
      }, 1800);
    } catch (err) {
      console.error("[bug-report] submit failed", safeErrorMessage(err));
      Alert.alert(t("bug_report_error_title"), t("bug_report_error_body"), [
        { text: t("alert_ok") },
      ]);
      setSending(false);
    }
  }

  // The modal renders one of two views: the form, or (briefly) a success
  // panel after a successful submit.
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={sending ? undefined : handleCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.backdrop}
      >
        <View style={styles.card}>
          {showSuccess ? (
            <View style={styles.successWrap}>
              <Ionicons
                name="checkmark-circle"
                size={56}
                color="#1F8A4C"
                style={styles.successIcon}
              />
              <Text
                style={[
                  styles.successTitle,
                  { fontSize: 22 * settings.fontScale },
                ]}
              >
                {t("bug_report_success_title")}
              </Text>
              <Text
                style={[
                  styles.successBody,
                  {
                    fontSize: 18 * settings.fontScale,
                    lineHeight: 26 * settings.fontScale,
                  },
                ]}
              >
                {t("bug_report_success_body")}
              </Text>
            </View>
          ) : (
            <>
              <Text
                style={[
                  styles.title,
                  { fontSize: 22 * settings.fontScale },
                ]}
              >
                {t("bug_report_modal_title")}
              </Text>

              <ScrollView
                style={styles.bodyScroll}
                contentContainerStyle={styles.bodyContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <Text
                  style={[
                    styles.body,
                    {
                      fontSize: 16 * settings.fontScale,
                      lineHeight: 22 * settings.fontScale,
                    },
                  ]}
                >
                  {t("bug_report_modal_body")}
                </Text>

                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder={t("bug_report_description_placeholder")}
                  placeholderTextColor="#8E96A8"
                  multiline
                  editable={!sending}
                  style={[
                    styles.input,
                    { fontSize: 18 * settings.fontScale },
                  ]}
                  accessibilityLabel={t("bug_report_description_placeholder")}
                />

                {image ? (
                  <View style={styles.imagePreviewWrap}>
                    <Image
                      source={{ uri: image.uri }}
                      style={styles.imagePreview}
                      resizeMode="cover"
                    />
                    <Pressable
                      onPress={handleRemoveImage}
                      disabled={sending}
                      accessibilityRole="button"
                      accessibilityLabel={t("bug_report_remove_image_a11y")}
                      hitSlop={10}
                      style={({ pressed }) => [
                        styles.removeImageBadge,
                        pressed && styles.removeImageBadgePressed,
                      ]}
                    >
                      <Ionicons name="close" size={18} color="#FFFFFF" />
                      <Text style={styles.removeImageText}>
                        {t("bug_report_remove_image")}
                      </Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.attachRow}>
                    <Pressable
                      onPress={handleTakePhoto}
                      disabled={sending}
                      accessibilityRole="button"
                      accessibilityLabel={t("bug_report_take_screenshot")}
                      style={({ pressed }) => [
                        styles.attachButton,
                        pressed && styles.attachButtonPressed,
                        sending && styles.attachButtonDisabled,
                      ]}
                    >
                      <Ionicons name="camera" size={20} color="#2A6CF6" />
                      <Text style={styles.attachButtonText}>
                        {t("bug_report_take_screenshot")}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={handlePickFromGallery}
                      disabled={sending}
                      accessibilityRole="button"
                      accessibilityLabel={t("bug_report_pick_screenshot")}
                      style={({ pressed }) => [
                        styles.attachButton,
                        pressed && styles.attachButtonPressed,
                        sending && styles.attachButtonDisabled,
                      ]}
                    >
                      <Ionicons name="images-outline" size={20} color="#2A6CF6" />
                      <Text style={styles.attachButtonText}>
                        {t("bug_report_pick_screenshot")}
                      </Text>
                    </Pressable>
                  </View>
                )}
              </ScrollView>

              <View style={styles.actionRow}>
                <Pressable
                  onPress={handleCancel}
                  disabled={sending}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    pressed && styles.secondaryButtonPressed,
                    sending && styles.secondaryButtonDisabled,
                  ]}
                >
                  <Text style={styles.secondaryButtonText}>
                    {t("bug_report_cancel")}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleSend}
                  disabled={!canSend}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && styles.primaryButtonPressed,
                    !canSend && styles.primaryButtonDisabled,
                  ]}
                >
                  {sending ? (
                    <View style={styles.sendingRow}>
                      <ActivityIndicator size="small" color="#FFFFFF" />
                      <Text style={styles.primaryButtonText}>
                        {t("bug_report_sending")}
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      {t("bug_report_send")}
                    </Text>
                  )}
                </Pressable>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
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
    maxHeight: "90%",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1A1F2C",
    marginBottom: 12,
  },
  bodyScroll: {
    flexGrow: 0,
    marginBottom: 16,
  },
  bodyContent: {
    paddingBottom: 4,
  },
  body: {
    fontSize: 16,
    lineHeight: 22,
    color: "#5A6173",
    marginBottom: 16,
  },
  input: {
    backgroundColor: "#F6F7FB",
    borderRadius: 14,
    padding: 14,
    fontSize: 18,
    color: "#1A1F2C",
    minHeight: 96,
    textAlignVertical: "top",
    marginBottom: 16,
  },
  attachRow: {
    flexDirection: "row",
    gap: 10,
  },
  attachButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#F1F4FB",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    minHeight: 56,
  },
  attachButtonPressed: {
    backgroundColor: "#E4ECFB",
  },
  attachButtonDisabled: {
    opacity: 0.5,
  },
  attachButtonText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: "#1A1F2C",
    textAlign: "center",
  },
  imagePreviewWrap: {
    alignItems: "flex-start",
    gap: 8,
  },
  imagePreview: {
    width: "100%",
    height: 200,
    borderRadius: 14,
    backgroundColor: "#1A1F2C",
  },
  removeImageBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#1A1F2C",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    minHeight: 36,
  },
  removeImageBadgePressed: {
    opacity: 0.85,
  },
  removeImageText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: "#F1F4FB",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  secondaryButtonPressed: {
    backgroundColor: "#E4ECFB",
  },
  secondaryButtonDisabled: {
    opacity: 0.5,
  },
  secondaryButtonText: {
    color: "#1A1F2C",
    fontSize: 17,
    fontWeight: "600",
  },
  primaryButton: {
    flex: 1,
    backgroundColor: "#2A6CF6",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  primaryButtonPressed: {
    opacity: 0.85,
  },
  primaryButtonDisabled: {
    backgroundColor: "#B5C4E8",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "600",
  },
  sendingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  successWrap: {
    alignItems: "center",
    paddingVertical: 16,
    gap: 12,
  },
  successIcon: {
    marginBottom: 4,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1A1F2C",
    textAlign: "center",
  },
  successBody: {
    fontSize: 18,
    lineHeight: 26,
    color: "#5A6173",
    textAlign: "center",
  },
});
