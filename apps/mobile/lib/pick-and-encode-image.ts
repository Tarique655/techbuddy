import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";

import type { ImageInput } from "@techbuddy/shared";

/**
 * Take a fresh photo via the rear camera, resize to 1600px on the long
 * edge, JPEG q0.7, base64-encode for the wire. Returns null on cancel
 * or if the senior denied camera permission.
 *
 * Why this exists in lib/: chat.tsx and bug-report-modal.tsx both had
 * a near-identical pipeline. The previous duplication had drifted —
 * one used the deprecated `ImagePicker.MediaTypeOptions.Images` enum,
 * the other used the new `["images"]` array form. Centralizing here
 * keeps both callers on the modern API.
 *
 * The caller decides what to do with permission denial / cancellation
 * (silent in chat, in-modal alert in bug-report). Throws on the
 * underlying SDK errors (camera open failure, encode failure) — let
 * the caller render the right localized alert.
 */
export type PickedImage = {
  /** Local file URI for preview <Image>. */
  uri: string;
  /** Wire-format payload to POST. */
  payload: ImageInput;
};

const RESIZE_MAX_WIDTH = 1600;
const COMPRESS_QUALITY = 0.7;

async function processAsset(
  asset: ImagePicker.ImagePickerAsset
): Promise<PickedImage> {
  const resized = await ImageManipulator.manipulateAsync(
    asset.uri,
    [{ resize: { width: RESIZE_MAX_WIDTH } }],
    { compress: COMPRESS_QUALITY, format: ImageManipulator.SaveFormat.JPEG }
  );
  const base64 = await FileSystem.readAsStringAsync(resized.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return {
    uri: resized.uri,
    payload: { base64, mediaType: "image/jpeg" },
  };
}

export type CameraResult =
  | { kind: "ok"; image: PickedImage }
  | { kind: "cancelled" }
  | { kind: "permission-denied" };

export async function takePhotoAndEncode(): Promise<CameraResult> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return { kind: "permission-denied" };

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: 0.8,
    allowsEditing: false,
    cameraType: ImagePicker.CameraType.back,
  });

  if (result.canceled || !result.assets?.[0]) return { kind: "cancelled" };
  const image = await processAsset(result.assets[0]);
  return { kind: "ok", image };
}

export type GalleryResult =
  | { kind: "ok"; image: PickedImage }
  | { kind: "cancelled" };

/**
 * Open the OS Photo Picker (no permission prompt — Android 13+ uses
 * the permissionless system picker; iOS uses the Photos limited
 * picker). Returns the picked image already resized + encoded.
 */
export async function pickFromGalleryAndEncode(): Promise<GalleryResult> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.8,
    allowsEditing: false,
    selectionLimit: 1,
  });

  if (result.canceled || !result.assets?.[0]) return { kind: "cancelled" };
  const image = await processAsset(result.assets[0]);
  return { kind: "ok", image };
}
