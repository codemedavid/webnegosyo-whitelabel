import { getWebAppUrl } from "./web-app-url";
import { TENANT_LOGO_FOLDER } from "./tenant-logo";
import { getAccessTokenBounded } from "./authorized-post";

export interface ImageKitUploadResult {
  url: string;
  fileId: string;
  filePath: string;
}

/**
 * What POST /api/imagekit/auth answers: an ImageKit upload API v2 token whose
 * signature binds `fields` (folder, file name, unique naming, no overwrite).
 * ImageKit refuses an upload whose form fields differ from them in any way.
 */
interface SignedUpload {
  token: string;
  fields: Record<string, string>;
  uploadUrl: string;
}

interface PickedImage {
  uri: string;
  fileName: string;
  mimeType: string;
}

/** Same bound the register uses for its other authenticated web calls. */
const SESSION_READ_TIMEOUT_MS = 8_000;

/**
 * Ask the web app to sign this upload, as the signed-in staff member. The web
 * app only signs for store admins, and only for a folder it can sanitise.
 */
async function fetchSignedUpload(folder: string, fileName: string): Promise<SignedUpload> {
  const accessToken = await getAccessTokenBounded(SESSION_READ_TIMEOUT_MS);
  if (!accessToken) {
    throw new Error("Please sign in again to upload images.");
  }

  const res = await fetch(`${getWebAppUrl()}/api/imagekit/auth`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ folder, fileName }),
  });
  if (!res.ok) {
    throw new Error("Could not authorize upload. Please try again.");
  }
  return (await res.json()) as SignedUpload;
}

/** Validates and normalizes the raw ImageKit upload response. */
export function parseUploadResponse(json: {
  url?: string;
  fileId?: string;
  filePath?: string;
}): ImageKitUploadResult {
  if (!json.url || !json.fileId || !json.filePath) {
    throw new Error("Upload response was missing fields.");
  }
  return {
    url: json.url,
    fileId: json.fileId,
    filePath: json.filePath.replace(/^\//, ""),
  };
}

/** ImageKit folder for menu item photos. */
export const PRODUCT_IMAGE_FOLDER = "menu-items";

/**
 * ImageKit folder for POS payment-confirmation screenshots.
 *
 * NOTE: the web app's purge-on-verify deletes payment proofs from CLOUDINARY,
 * so proofs captured at the register are not covered by that sweep. Tracked as
 * a follow-up; see docs/testing/pos-register.tdd.md.
 */
export const PAYMENT_PROOF_FOLDER = "payment-proofs";

/**
 * ImageKit folder for the QR images shown at checkout.
 *
 * Same folder name the web admin uploads to, so a merchant's QR codes stay in
 * one place whichever surface they set them up from.
 */
export const PAYMENT_QR_FOLDER = "payment-qr-codes";

/**
 * Upload an image to ImageKit via the web app's signed-upload endpoint and
 * return its delivery url + fileId + filePath.
 */
export async function uploadImage(
  image: PickedImage,
  folder: string
): Promise<ImageKitUploadResult> {
  const signed = await fetchSignedUpload(folder, image.fileName);

  const formData = new FormData();
  formData.append("file", {
    uri: image.uri,
    name: image.fileName,
    type: image.mimeType,
  } as unknown as Blob);
  // Exactly the signed fields — nothing added, nothing left out.
  for (const [key, value] of Object.entries(signed.fields)) {
    formData.append(key, value);
  }
  formData.append("token", signed.token);

  const res = await fetch(signed.uploadUrl, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    throw new Error("Upload failed. Please try again.");
  }

  const json = (await res.json()) as {
    url?: string;
    fileId?: string;
    filePath?: string;
  };
  return parseUploadResponse(json);
}

/** Upload a menu item photo. Thin wrapper so existing call sites are unchanged. */
export function uploadProductImage(image: PickedImage): Promise<ImageKitUploadResult> {
  return uploadImage(image, PRODUCT_IMAGE_FOLDER);
}

/** Upload a payment method's QR code into its own folder. */
export function uploadPaymentQr(image: PickedImage): Promise<ImageKitUploadResult> {
  return uploadImage(image, PAYMENT_QR_FOLDER);
}

/** Upload a restaurant logo into its own folder. */
export function uploadTenantLogo(image: PickedImage): Promise<ImageKitUploadResult> {
  return uploadImage(image, TENANT_LOGO_FOLDER);
}
