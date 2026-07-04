/**
 * Product-image picker wrapper with graceful degradation.
 *
 * `expo-image-picker` resolves its native module (`ExponentImagePicker`) at
 * import time, so a static top-level import throws during module evaluation
 * when the native module is missing from the running binary — which takes the
 * whole product editor screen down. This module lazy-loads the picker inside
 * {@link pickProductImage} and reports a typed outcome, so a missing native
 * module degrades to a friendly message instead of crashing the route.
 */

export interface PickedImage {
  uri: string;
  fileName: string;
  mimeType: string;
}

export type PickImageOutcome =
  | { status: "picked"; image: PickedImage }
  | { status: "canceled" }
  | { status: "permission-denied" }
  | { status: "unavailable" };

const DEFAULT_FILE_NAME = "product.jpg";
const DEFAULT_MIME_TYPE = "image/jpeg";

/**
 * True when `error` is the "native module not linked" failure raised by
 * expo-modules-core (e.g. the picker's native side isn't in this build).
 */
export function isNativeModuleMissingError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return (
    message.includes("Cannot find native module") ||
    message.includes("ExponentImagePicker")
  );
}

/** Maps a raw picker asset to a {@link PickedImage} with sensible fallbacks. */
export function toPickedImage(asset: {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
}): PickedImage {
  return {
    uri: asset.uri,
    fileName: asset.fileName ?? DEFAULT_FILE_NAME,
    mimeType: asset.mimeType ?? DEFAULT_MIME_TYPE,
  };
}

/**
 * Request library access and let the user pick one product image.
 *
 * Lazy-loads `expo-image-picker` so a missing native module surfaces as
 * `{ status: "unavailable" }` rather than throwing at screen import time.
 */
export async function pickProductImage(): Promise<PickImageOutcome> {
  try {
    const ImagePicker = await import("expo-image-picker");

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return { status: "permission-denied" };
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: true,
      aspect: [4, 3],
    });

    if (result.canceled || !result.assets?.[0]) {
      return { status: "canceled" };
    }

    return { status: "picked", image: toPickedImage(result.assets[0]) };
  } catch (error: unknown) {
    if (isNativeModuleMissingError(error)) {
      return { status: "unavailable" };
    }
    throw error;
  }
}
