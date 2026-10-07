/**
 * Menu photos for the Owl, picked from the library as JPEG data URLs.
 *
 * The binary has no image-resize module, so a photo is only re-compressed
 * (quality below) — a 12MP phone shot lands near ~1MB, inside the server's
 * per-photo cap. Lazy-loads `expo-image-picker` for the same reason as
 * lib/image-picker.ts: a build without the native module must degrade to a
 * message, not crash the panel.
 */

import { isNativeModuleMissingError } from "../image-picker";
import { MAX_PHOTO_DATA_URL_CHARS, MAX_PHOTOS_TOTAL_CHARS } from "./presentation";

/** Low enough for a phone photo to travel, high enough for menu prices to stay legible. */
const PHOTO_QUALITY = 0.4;

export type PickMenuPhotosOutcome =
  /** `isTrimmed`: some picked photos were left out because they would not fit. */
  | { status: "picked"; photos: string[]; isTrimmed: boolean }
  | { status: "canceled" }
  | { status: "permission-denied" }
  | { status: "unavailable" }
  | { status: "too-large" };

interface PickerAsset {
  base64?: string | null;
  mimeType?: string | null;
}

/** The picker re-encodes at quality < 1, so anything but PNG/WebP is a JPEG. */
export function toPhotoDataUrl(asset: PickerAsset): string | null {
  if (!asset.base64) return null;
  const type = asset.mimeType === "image/png" || asset.mimeType === "image/webp" ? asset.mimeType : "image/jpeg";
  return `data:${type};base64,${asset.base64}`;
}

/** Keeps the photos that fit the caps, given the ones already attached. */
export function fitPhotos(existing: readonly string[], picked: readonly string[]): { photos: string[]; isTooLarge: boolean } {
  let total = existing.reduce((sum, photo) => sum + photo.length, 0);
  const photos: string[] = [];
  for (const photo of picked) {
    if (photo.length > MAX_PHOTO_DATA_URL_CHARS || total + photo.length > MAX_PHOTOS_TOTAL_CHARS) {
      return { photos, isTooLarge: true };
    }
    total += photo.length;
    photos.push(photo);
  }
  return { photos, isTooLarge: false };
}

export async function pickMenuPhotos(existing: readonly string[], limit: number): Promise<PickMenuPhotosOutcome> {
  if (limit <= 0) return { status: "canceled" };
  try {
    const ImagePicker = await import("expo-image-picker");
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return { status: "permission-denied" };

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: PHOTO_QUALITY,
      base64: true,
      allowsMultipleSelection: limit > 1,
      selectionLimit: limit,
    });
    if (result.canceled || !result.assets?.length) return { status: "canceled" };

    const picked = result.assets.slice(0, limit).flatMap((asset) => {
      const url = toPhotoDataUrl(asset);
      return url ? [url] : [];
    });
    if (picked.length === 0) return { status: "canceled" };
    const { photos, isTooLarge } = fitPhotos(existing, picked);
    return photos.length === 0 ? { status: "too-large" } : { status: "picked", photos, isTrimmed: isTooLarge };
  } catch (error: unknown) {
    if (isNativeModuleMissingError(error)) return { status: "unavailable" };
    throw error;
  }
}
