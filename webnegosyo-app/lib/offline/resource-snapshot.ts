/**
 * A disk copy of a read the register cannot open without.
 *
 * The query cache (`lib/query/*`) lives in memory and is gone after a force
 * quit, so an offline launch had nothing to sell from. This wraps a fetcher:
 * a successful read is written to AsyncStorage (only when its bytes changed,
 * so the 10-second focus refetch costs no disk writes while nothing moves),
 * and an unreachable read answers from that copy instead of erroring.
 *
 * The server is asked first whenever the device may be online, and the
 * snapshot answers only when it fails — or, when a snapshot exists, when it
 * has not answered within `SNAPSHOT_DEADLINE_MS` (a shop on Wi-Fi with no
 * internet behind it, or a token refresh retrying for half a minute, would
 * otherwise hold the register on a spinner). A late answer is still saved.
 * While the device is KNOWN to be offline the snapshot answers at once; the
 * reconnect refresh (`use-offline-pack.ts`) brings the live copy back.
 *
 * A read that has never succeeded on this device still goes to the server and
 * fails, which is right: there is no menu to sell from and the register must
 * say so, not sell nothing at all. `offline-pack.ts` saves every register read
 * up front, so that is only true of a device that has never been online.
 *
 * Keyed by the cache key it stands in for, tenant included, so a device that
 * signs into another store never sells the previous store's menu.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { isOffline, reportOnline, reportOutcome } from "./connectivity";
import { isNetworkFailure } from "./network-error";

export const RESOURCE_SNAPSHOT_PREFIX = "offline_res_v1:";

/** How long a read may take before a saved copy answers in its place. */
export const SNAPSHOT_DEADLINE_MS = 6_000;

interface StoredSnapshot<T> {
  savedAt: number;
  value: T;
}

/** What each snapshot last wrote, so an unchanged read never touches disk. */
const lastWritten = new Map<string, string>();

export function resourceSnapshotKey(queryKey: readonly unknown[]): string {
  return RESOURCE_SNAPSHOT_PREFIX + queryKey.map((part) => String(part)).join(":");
}

function serialize<T>(value: T, now: number): { fingerprint: string; serialized: string } | null {
  try {
    return {
      fingerprint: JSON.stringify({ value }),
      serialized: JSON.stringify({ savedAt: now, value } satisfies StoredSnapshot<T>),
    };
  } catch {
    return null;
  }
}

async function persistSnapshot<T>(storageKey: string, value: T, now: number): Promise<void> {
  const encoded = serialize(value, now);
  if (encoded === null) return;
  const { fingerprint, serialized } = encoded;
  if (lastWritten.get(storageKey) === fingerprint) return;
  lastWritten.set(storageKey, fingerprint);
  try {
    await AsyncStorage.setItem(storageKey, serialized);
  } catch (error) {
    // The next successful read will try again; the in-memory copy must not
    // pretend the write landed.
    lastWritten.delete(storageKey);
    console.warn("[offline] Could not save a resource snapshot:", error);
  }
}

/**
 * Write a snapshot now and resolve once it is on disk.
 *
 * For the offline download (`offline-pack.ts`), which must not claim a copy it
 * does not have: unlike the read path it rejects on a failed write, and it
 * always rewrites so the saved time moves forward even when nothing changed.
 */
export async function saveResourceSnapshot<T>(storageKey: string, value: T, now: number): Promise<void> {
  const encoded = serialize(value, now);
  if (encoded === null) throw new Error("This data cannot be saved on the device.");
  await AsyncStorage.setItem(storageKey, encoded.serialized);
  lastWritten.set(storageKey, encoded.fingerprint);
}

export async function readResourceSnapshot<T>(storageKey: string): Promise<StoredSnapshot<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const candidate = parsed as Partial<StoredSnapshot<T>>;
    if (typeof candidate.savedAt !== "number" || !("value" in candidate)) return null;
    return { savedAt: candidate.savedAt, value: candidate.value as T };
  } catch {
    return null;
  }
}

export interface SnapshotDeps {
  now?: () => number;
  /** Override `SNAPSHOT_DEADLINE_MS` (tests). */
  deadlineMs?: number;
}

const TIMED_OUT = Symbol("timed-out");

/**
 * Run `fetcher`; on success remember the answer, on network failure answer from the
 * last remembered one. Rethrows the original failure when there is nothing
 * remembered. Reports the outcome to the connectivity belief either way.
 */
export async function withOfflineSnapshot<T>(
  storageKey: string,
  fetcher: () => Promise<T>,
  deps: SnapshotDeps = {}
): Promise<T> {
  const now = deps.now ?? Date.now;
  const deadlineMs = deps.deadlineMs ?? SNAPSHOT_DEADLINE_MS;

  // Known offline: do not make the cashier wait out a request that cannot land.
  if (isOffline()) {
    const snapshot = await readResourceSnapshot<T>(storageKey);
    if (snapshot !== null) return snapshot.value;
  }

  const work = fetcher().then(
    (value) => {
      reportOnline(now());
      void persistSnapshot(storageKey, value, now());
      return value;
    },
    (error: unknown) => {
      reportOutcome(error, now());
      throw error;
    }
  );

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), deadlineMs);
  });

  try {
    const first = await Promise.race([work, deadline]);
    if (first !== TIMED_OUT) return first;
    const snapshot = await readResourceSnapshot<T>(storageKey);
    if (snapshot === null) return await work;
    // The abandoned read still saves its answer if it lands; its failure is
    // already reported and must not surface as an unhandled rejection.
    work.catch(() => undefined);
    return snapshot.value;
  } catch (error) {
    if (!isNetworkFailure(error)) throw error;
    const snapshot = await readResourceSnapshot<T>(storageKey);
    if (snapshot === null) throw error;
    return snapshot.value;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Test seam. */
export function resetResourceSnapshotsForTests(): void {
  lastWritten.clear();
}
