// The "DM us for a 1:1 consultation" call-to-action target. Opens Facebook
// Messenger (m.me links launch the Messenger app when installed, else the
// browser). The handle is configurable per build via
// EXPO_PUBLIC_CONSULTATION_MESSENGER_URL (see app.config.ts extra), so it is
// opened through the same URL allowlist as every link the app did not author.

import Constants from "expo-constants";
import { openExternalUrl } from "./safe-url";

const DEFAULT_CONSULTATION_URL = "https://m.me/webnegosyoofficial";

export const CONSULTATION_MESSENGER_URL: string =
  Constants.expoConfig?.extra?.consultationUrl ?? DEFAULT_CONSULTATION_URL;

/** Open the consultation Messenger thread; resolves false if it can't launch. */
export function openConsultation(
  url: string = CONSULTATION_MESSENGER_URL,
): Promise<boolean> {
  return openExternalUrl(url);
}
