/**
 * The day's deposit slip photo: picked and uploaded through the app's existing
 * image upload (ImageKit, signed by the web), into its own folder. Resolves to
 * the delivery url, or null when the person backs out.
 */

import { pickProductImage } from "../image-picker";
import { uploadImage } from "../product-image-upload";

export const DEPOSIT_PROOF_FOLDER = "day-close-deposits";

export async function pickAndUploadDepositPhoto(): Promise<string | null> {
  const outcome = await pickProductImage();
  if (outcome.status === "canceled") return null;
  if (outcome.status === "permission-denied") throw new Error("Allow photo access in Settings to add the slip.");
  if (outcome.status === "unavailable") throw new Error("Photos need the latest app. Record the deposit without one for now.");
  const uploaded = await uploadImage(outcome.image, DEPOSIT_PROOF_FOLDER);
  return uploaded.url;
}
