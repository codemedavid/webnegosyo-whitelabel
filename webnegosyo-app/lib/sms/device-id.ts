/**
 * A stable per-installation id, used as the run claim's owner.
 *
 * It only has to be unique between the handsets signed into one store, and it
 * only has to survive app restarts — a merchant who reinstalls simply becomes a
 * "new" device, which is harmless because claims are per run. It is written
 * once and read from memory afterwards, since the send loop asks for it between
 * messages.
 *
 * Deliberately not a real UUID: `expo-crypto` is not a dependency here, and
 * adding one for an identifier that never leaves the tenant's own rows would be
 * cost without benefit.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "sms.deviceId";

let cached: string | null = null;

function randomId(): string {
  const part = () => Math.random().toString(36).slice(2, 10);
  return `dev_${part()}${part()}`;
}

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;

  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      cached = stored;
      return stored;
    }
  } catch {
    // Storage unavailable — fall through to a session-only id. A per-session
    // id still prevents two DEVICES colliding, which is what the claim is for.
  }

  const created = randomId();
  cached = created;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, created);
  } catch {
    // Non-fatal: see above.
  }
  return created;
}

/** Test seam; also used when a merchant signs out of a shared handset. */
export function resetDeviceIdCache(): void {
  cached = null;
}
