import Constants from "expo-constants";

const IMAGEKIT_UPLOAD_ENDPOINT = "https://upload.imagekit.io/api/v1/files/upload";

export interface ImageKitUploadResult {
  url: string;
  fileId: string;
  filePath: string;
}

interface UploadAuth {
  token: string;
  expire: number;
  signature: string;
  publicKey: string;
}

interface PickedImage {
  uri: string;
  fileName: string;
  mimeType: string;
}

function getWebAppUrl(): string {
  return Constants.expoConfig?.extra?.webAppUrl ?? "https://webnegosyo.com";
}

async function fetchUploadAuth(): Promise<UploadAuth> {
  const res = await fetch(`${getWebAppUrl()}/api/imagekit/auth`);
  if (!res.ok) {
    throw new Error("Could not authorize upload. Please try again.");
  }
  return (await res.json()) as UploadAuth;
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
 * Upload an image to ImageKit via the web app's signed-auth endpoint and
 * return its delivery url + fileId + filePath.
 */
export async function uploadImage(
  image: PickedImage,
  folder: string
): Promise<ImageKitUploadResult> {
  const auth = await fetchUploadAuth();

  const formData = new FormData();
  formData.append("file", {
    uri: image.uri,
    name: image.fileName,
    type: image.mimeType,
  } as unknown as Blob);
  formData.append("fileName", image.fileName);
  formData.append("publicKey", auth.publicKey);
  formData.append("signature", auth.signature);
  formData.append("expire", String(auth.expire));
  formData.append("token", auth.token);
  formData.append("folder", folder);
  formData.append("useUniqueFileName", "true");

  const res = await fetch(IMAGEKIT_UPLOAD_ENDPOINT, {
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
