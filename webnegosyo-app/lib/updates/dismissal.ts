// Remembers which update offer this device waved away, so a dismissible
// nudge does not reappear on every launch. Scoped to the device rather than
// the account: it is about this install's version, not who is signed in.
//
// Blocking prompts never consult this — see `decideUpdatePrompt`.

import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "app-update:dismissed-signature";

export async function readDismissedSignature(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEY);
  } catch {
    // Storage unavailable just means the nudge shows again next launch.
    return null;
  }
}

export async function writeDismissedSignature(signature: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, signature);
  } catch {
    // Same: worst case the merchant is asked once more.
  }
}
