/**
 * Where the handset keeps its loyalty SMS enrollment.
 *
 * The credential is the only proof this device may deliver OTPs, so it lives
 * in the OS keystore (expo-secure-store), never AsyncStorage, and is scoped to
 * the tenant AND the signed-in actor: the server enrolled that pair, and a
 * different staff member on the same handset must enroll their own.
 *
 * A port, not an import of the native module, so the logic suite can run it.
 */

export type DeviceEnrollment = { deviceId: string; credential: string };

export type SecureStorage = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

type Scope = { tenantId: string; actorId: string };

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const CREDENTIAL = /^[A-Za-z0-9_-]{43}$/;
const MAX_STORED_LENGTH = 512;
const listeners = new Map<string, Set<() => void>>();
const pending = new Map<string, Promise<unknown>>();

function scopeKey(scope: Scope): string {
  if (!UUID.test(scope.tenantId) || !UUID.test(scope.actorId)) {
    throw new Error("Invalid loyalty device scope");
  }
  return `loyalty.sms.device.v1.${scope.tenantId.toLowerCase()}.${scope.actorId.toLowerCase()}`;
}

export function subscribeDeviceEnrollment(scope: Scope, changed: () => void) {
  const key = scopeKey(scope);
  const callbacks = listeners.get(key) ?? new Set<() => void>();
  listeners.set(key, callbacks);
  callbacks.add(changed);
  return () => { callbacks.delete(changed); if (!callbacks.size) listeners.delete(key); };
}

function isEnrollment(value: unknown): value is DeviceEnrollment {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    Object.keys(entry).length === 2 &&
    typeof entry.deviceId === "string" &&
    UUID.test(entry.deviceId) &&
    typeof entry.credential === "string" &&
    CREDENTIAL.test(entry.credential)
  );
}

export function createDeviceCredentialStore(secure: SecureStorage, scope: Scope) {
  const key = scopeKey(scope);
  function serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = (pending.get(key) ?? Promise.resolve()).then(operation, operation);
    pending.set(key, result);
    void result.finally(() => { if (pending.get(key) === result) pending.delete(key); }).catch(() => undefined);
    return result;
  }
  const notify = () => { listeners.get(key)?.forEach((changed) => changed()); };
  /** Must run inside serial, including corrupt-value removal. */
  async function readStored(): Promise<DeviceEnrollment | null> {
    let raw: string | null;
    try {
      raw = await secure.getItemAsync(key);
    } catch {
      return null;
    }
    if (raw === null) return null;
    try {
      if (raw.length > MAX_STORED_LENGTH) throw new Error();
      const parsed: unknown = JSON.parse(raw);
      if (!isEnrollment(parsed)) throw new Error();
      return { deviceId: parsed.deviceId, credential: parsed.credential };
    } catch {
      try {
        await secure.deleteItemAsync(key);
      } catch {
        /* Nothing more to do; the value is unreadable either way. */
      }
      return null;
    }
  }
  return {
    /** Null when nothing usable is stored. Corrupt values are discarded. */
    read: () => serial(readStored),
    write(entry: DeviceEnrollment): Promise<void> {
      return serial(async () => {
        if (!isEnrollment(entry)) throw new Error("Invalid loyalty device enrollment");
        await secure.setItemAsync(
          key,
          JSON.stringify({ deviceId: entry.deviceId, credential: entry.credential }),
        );
        notify();
      });
    },
    clear(): Promise<void> {
      return serial(async () => { await secure.deleteItemAsync(key); notify(); });
    },
    /** A late response from an old worker cannot erase a newer credential. */
    clearIfMatches(expected: DeviceEnrollment): Promise<boolean> {
      return serial(async () => {
        const current = await readStored();
        if (!current || current.deviceId !== expected.deviceId || current.credential !== expected.credential) return false;
        await secure.deleteItemAsync(key);
        notify();
        return true;
      });
    },
  };
}

export type DeviceCredentialStore = ReturnType<typeof createDeviceCredentialStore>;
