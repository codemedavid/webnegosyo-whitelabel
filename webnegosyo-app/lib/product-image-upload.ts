import { getWebAppUrl } from "./web-app-url";
import { TENANT_LOGO_FOLDER } from "./tenant-logo";
import { getAccessTokenBounded } from "./authorized-post";
import { readLocalFile } from "./local-file";

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
  provider?: "imagekit";
  token: string;
  fields: Record<string, string>;
  uploadUrl: string;
}

/**
 * What POST /api/uploads/sign answers when new uploads go to Cloudflare R2: a
 * presigned PUT bound to the key, type, exact size and no-overwrite.
 */
interface R2SignedUpload {
  provider: "r2";
  uploadUrl: string;
  method: "PUT";
  /** Part of the signature: sent verbatim, nothing added. */
  headers: Record<string, string>;
  url: string;
  fileId: string;
  filePath: string;
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
interface UploadDescription {
  folder: string;
  fileName: string;
  contentType: string;
  size: number;
}

/**
 * Ask the web app to sign this upload, as the signed-in staff member. The web
 * app only signs for store admins, and only for a folder it can sanitise.
 * `/api/uploads/sign` decides between R2 and ImageKit; a web deploy that
 * predates it (404) falls back to the ImageKit-only route.
 */
async function fetchSignedUpload(
  upload: UploadDescription
): Promise<SignedUpload | R2SignedUpload> {
  const accessToken = await getAccessTokenBounded(SESSION_READ_TIMEOUT_MS);
  if (!accessToken) {
    throw new Error("Please sign in again to upload images.");
  }

  const post = (path: string, body: unknown) =>
    fetch(`${getWebAppUrl()}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

  let res = await post("/api/uploads/sign", upload);
  if (res.status === 404) {
    res = await post("/api/imagekit/auth", { folder: upload.folder, fileName: upload.fileName });
  }
  if (!res.ok) {
    throw new Error("Could not authorize upload. Please try again.");
  }
  return (await res.json()) as SignedUpload | R2SignedUpload;
}

async function putToR2(signed: R2SignedUpload, file: Blob): Promise<ImageKitUploadResult> {
  const res = await fetch(signed.uploadUrl, {
    method: signed.method,
    headers: signed.headers,
    body: file,
  });
  if (!res.ok) {
    throw new Error("Upload failed. Please try again.");
  }
  return { url: signed.url, fileId: signed.fileId, filePath: signed.filePath };
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
 * Upload an image via the web app's signed-upload endpoint — to Cloudflare R2
 * or ImageKit, whichever the web app says — and return its delivery url +
 * fileId + filePath.
 */
export async function uploadImage(
  image: PickedImage,
  folder: string
): Promise<ImageKitUploadResult> {
  // R2 signs the exact size, so the bytes are read before asking.
  const file = await readLocalFile(image.uri);
  const signed = await fetchSignedUpload({
    folder,
    fileName: image.fileName,
    contentType: image.mimeType,
    size: file.size,
  });
  if (signed.provider === "r2") return putToR2(signed, file);

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
