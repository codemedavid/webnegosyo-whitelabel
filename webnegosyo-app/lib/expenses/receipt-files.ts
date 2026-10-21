/**
 * Taking or picking a receipt photo, and keeping it in the app's own folder
 * until it uploads.
 *
 * Both native modules (`expo-image-picker`, `expo-file-system`) are already in
 * the binary and are loaded lazily, like the Senior/PWD ID photo
 * (`lib/gov-id-photos/capture.ts`), so this stays OTA-able and logic tests
 * never load them. The app has no resize module: the picker's JPEG quality is
 * what keeps a receipt under the upload cap (`MAX_RECEIPT_BYTES`).
 */

import { isNativeModuleMissingError } from "../image-picker";
import { MAX_RECEIPT_BYTES, extensionFor, receiptMimeOf, type ReceiptMime } from "./receipt-queue";

type FileSystemModule = typeof import("expo-file-system/legacy");

const RECEIPT_FOLDER = "expense-receipts/";
/**
 * Receipt print is small, so a little sharper than an ID photo (0.4) — and
 * still a JPEG of a few hundred KB, far under the route's 4.5 MB body cap.
 * The picker re-encodes gallery picks at this quality too.
 */
const PHOTO_QUALITY = 0.5;

export interface CapturedReceipt {
  fileUri: string;
  mime: ReceiptMime;
}

export type CaptureReceiptOutcome =
  | { status: "captured"; receipt: CapturedReceipt }
  | { status: "canceled" }
  | { status: "permission-denied" }
  | { status: "too-large" }
  | { status: "unavailable" };

async function fileSystem(): Promise<FileSystemModule> {
  return import("expo-file-system/legacy");
}

async function receiptFolder(): Promise<string | null> {
  const FileSystem = await fileSystem();
  if (!FileSystem.documentDirectory) return null;
  const folder = `${FileSystem.documentDirectory}${RECEIPT_FOLDER}`;
  await FileSystem.makeDirectoryAsync(folder, { intermediates: true }).catch(() => undefined);
  return folder;
}

export async function deleteReceiptFile(fileUri: string): Promise<void> {
  const FileSystem = await fileSystem();
  await FileSystem.deleteAsync(fileUri, { idempotent: true });
}

/** Take a photo (`camera`) or pick one from the gallery (`library`). */
export async function captureReceipt(
  source: "camera" | "library",
  now: () => number = Date.now,
): Promise<CaptureReceiptOutcome> {
  try {
    const ImagePicker = await import("expo-image-picker");
    const permission =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return { status: "permission-denied" };

    const options = { mediaTypes: ["images" as const], quality: PHOTO_QUALITY, exif: false, allowsEditing: false };
    const result =
      source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? null : result.assets?.[0];
    if (!asset) return { status: "canceled" };

    const mime = receiptMimeOf(asset.fileName, asset.mimeType) ?? "image/jpeg";
    const folder = await receiptFolder();
    if (!folder) return { status: "unavailable" };
    const fileUri = `${folder}receipt-${now()}.${extensionFor(mime)}`;
    const FileSystem = await fileSystem();
    await FileSystem.copyAsync({ from: asset.uri, to: fileUri });
    // The camera's temporary copy is not ours to keep; a gallery original is.
    if (source === "camera") await deleteReceiptFile(asset.uri).catch(() => undefined);

    const info = await FileSystem.getInfoAsync(fileUri);
    const size = info.exists && typeof info.size === "number" ? info.size : null;
    if (size === null || size > MAX_RECEIPT_BYTES) {
      await deleteReceiptFile(fileUri).catch(() => undefined);
      return { status: size === null ? "unavailable" : "too-large" };
    }
    return { status: "captured", receipt: { fileUri, mime } };
  } catch (error: unknown) {
    if (isNativeModuleMissingError(error) || String(error).includes("ExponentFileSystem")) {
      return { status: "unavailable" };
    }
    throw error;
  }
}

/** Words for an outcome that did not produce a photo; null = say nothing (cancelled). */
export function describeCaptureOutcome(outcome: CaptureReceiptOutcome): string | null {
  switch (outcome.status) {
    case "permission-denied":
      return "Allow camera or photo access in your phone's settings to add a receipt.";
    case "too-large":
      return "That photo is too large to send. Take a new photo of the receipt instead.";
    case "unavailable":
      return "Receipts can't be added on this phone. Update the app and try again.";
    default:
      return null;
  }
}
