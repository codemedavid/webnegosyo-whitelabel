/**
 * Taking the optional photo of a Senior/PWD ID at the register.
 *
 * The camera's JPEG quality is what keeps the file small — the app has no
 * resize module — and a photo over the server's cap is refused here, with
 * words the cashier can act on, rather than failing silently later.
 */

import { isNativeModuleMissingError } from "../image-picker";
import { copyPhotoFile, deletePhotoFile, photoFileSize, photoFolderUri } from "./files";
import type { CapturedIdPhoto } from "./types";

/** Matches the server's cap (`MAX_ID_PHOTO_BYTES`, 3 MB). */
export const MAX_ID_PHOTO_BYTES = 3 * 1024 * 1024;
const CAMERA_QUALITY = 0.4;

export type CaptureIdPhotoOutcome =
  | { status: "captured"; photo: CapturedIdPhoto }
  | { status: "canceled" }
  | { status: "permission-denied" }
  | { status: "too-large" }
  | { status: "unavailable" };

function fileStem(claimantId: string): string {
  return claimantId.replace(/[^A-Za-z0-9_]/g, "").slice(0, 40) || "claimant";
}

export async function captureIdPhoto(claimantId: string, now: () => number = Date.now): Promise<CaptureIdPhotoOutcome> {
  try {
    const ImagePicker = await import("expo-image-picker");
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return { status: "permission-denied" };

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: CAMERA_QUALITY,
      exif: false,
      allowsEditing: false,
    });
    const asset = result.canceled ? null : result.assets?.[0];
    if (!asset) return { status: "canceled" };

    const folder = await photoFolderUri();
    if (!folder) return { status: "unavailable" };
    const takenAt = now();
    const fileUri = `${folder}${fileStem(claimantId)}-${takenAt}.jpg`;
    await copyPhotoFile(asset.uri, fileUri);
    // The camera's temporary copy is not ours to keep.
    await deletePhotoFile(asset.uri).catch(() => undefined);

    const size = await photoFileSize(fileUri);
    if (size === null || size > MAX_ID_PHOTO_BYTES) {
      await deletePhotoFile(fileUri).catch(() => undefined);
      return { status: size === null ? "unavailable" : "too-large" };
    }
    return { status: "captured", photo: { fileUri, capturedAt: new Date(takenAt).toISOString() } };
  } catch (error: unknown) {
    if (isNativeModuleMissingError(error) || String(error).includes("ExponentFileSystem")) {
      return { status: "unavailable" };
    }
    throw error;
  }
}

/** A photo the cashier retook or removed. Never throws. */
export async function discardIdPhoto(fileUri: string): Promise<void> {
  await deletePhotoFile(fileUri).catch(() => undefined);
}
