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
 * Fallback name for a logo asset the picker did not name.
 *
 * Distinct from the product default so an uploaded file stays identifiable in
 * ImageKit — everything landing as "product.jpg" is unrecoverable later.
 */
export const LOGO_FILE_NAME = "logo.jpg";

/** Fallback name for a payment QR the picker did not name. */
export const QR_FILE_NAME = "payment-qr.jpg";

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
export function toPickedImage(
  asset: {
    uri: string;
    fileName?: string | null;
    mimeType?: string | null;
  },
  fallbackFileName: string = DEFAULT_FILE_NAME
): PickedImage {
  return {
    uri: asset.uri,
    fileName: asset.fileName ?? fallbackFileName,
    mimeType: asset.mimeType ?? DEFAULT_MIME_TYPE,
  };
}

/**
 * Request library access and let the user pick one product image.
 *
 * Lazy-loads `expo-image-picker` so a missing native module surfaces as
 * `{ status: "unavailable" }` rather than throwing at screen import time.
 */
async function pickImage(
  aspect: [number, number],
  fallbackFileName: string
): Promise<PickImageOutcome> {
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
      aspect,
    });

    if (result.canceled || !result.assets?.[0]) {
      return { status: "canceled" };
    }

    return {
      status: "picked",
      image: toPickedImage(result.assets[0], fallbackFileName),
    };
  } catch (error: unknown) {
    if (isNativeModuleMissingError(error)) {
      return { status: "unavailable" };
    }
    throw error;
  }
}

export function pickProductImage(): Promise<PickImageOutcome> {
  return pickImage([4, 3], DEFAULT_FILE_NAME);
}

/**
 * Pick a restaurant logo. Crops square because every surface that renders a
 * logo (list badge, storefront header, app icon source) frames it as a square.
 */
export function pickLogoImage(): Promise<PickImageOutcome> {
  return pickImage([1, 1], LOGO_FILE_NAME);
}

/**
 * Pick a payment QR code. Crops square because a QR is square — cropping it to
 * 4:3 would clip a corner marker and leave a code nothing can scan.
 */
export function pickQrImage(): Promise<PickImageOutcome> {
  return pickImage([1, 1], QR_FILE_NAME);
}
