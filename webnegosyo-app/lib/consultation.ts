// The "DM us for a 1:1 consultation" call-to-action target. Opens Facebook
// Messenger (m.me links launch the Messenger app when installed, else the
// browser). The handle is configurable per build via
// EXPO_PUBLIC_CONSULTATION_MESSENGER_URL (see app.config.ts extra).

import { Linking } from "react-native";
import Constants from "expo-constants";

const DEFAULT_CONSULTATION_URL = "https://m.me/webnegosyo";

export const CONSULTATION_MESSENGER_URL: string =
  Constants.expoConfig?.extra?.consultationUrl ?? DEFAULT_CONSULTATION_URL;

/** Open the consultation Messenger thread; resolves false if it can't launch. */
export async function openConsultation(
  url: string = CONSULTATION_MESSENGER_URL,
): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
