/**
 * A disk copy of a read the register cannot open without.
 *
 * The query cache (`lib/query/*`) lives in memory and is gone after a force
 * quit, so an offline launch had nothing to sell from. This wraps a fetcher:
 * a successful read is written to AsyncStorage (only when its bytes changed,
 * so the 10-second focus refetch costs no disk writes while nothing moves),
 * and a FAILED read answers from that copy instead of erroring.
 *
 * The online path is untouched — the server is always asked first, and the
 * snapshot is consulted only after it has failed to answer. A read that has
 * never succeeded on this device still fails, which is right: there is no
 * menu to sell from and the register must say so, not sell nothing at all.
 *
 * Keyed by the cache key it stands in for, tenant included, so a device that
 * signs into another store never sells the previous store's menu.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { reportOnline, reportOutcome } from "./connectivity";

export const RESOURCE_SNAPSHOT_PREFIX = "offline_res_v1:";

interface StoredSnapshot<T> {
  savedAt: number;
  value: T;
}

/** What each snapshot last wrote, so an unchanged read never touches disk. */
const lastWritten = new Map<string, string>();

export function resourceSnapshotKey(queryKey: readonly unknown[]): string {
  return RESOURCE_SNAPSHOT_PREFIX + queryKey.map((part) => String(part)).join(":");
}

async function persistSnapshot<T>(storageKey: string, value: T, now: number): Promise<void> {
  let serialized: string;
  try {
    serialized = JSON.stringify({ savedAt: now, value } satisfies StoredSnapshot<T>);
  } catch {
    return;
  }
  if (lastWritten.get(storageKey) === serialized) return;
  lastWritten.set(storageKey, serialized);
  try {
    await AsyncStorage.setItem(storageKey, serialized);
  } catch (error) {
    // The next successful read will try again; the in-memory copy must not
    // pretend the write landed.
    lastWritten.delete(storageKey);
    console.warn("[offline] Could not save a resource snapshot:", error);
  }
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
}

/**
 * Run `fetcher`; on success remember the answer, on failure answer from the
 * last remembered one. Rethrows the original failure when there is nothing
 * remembered. Reports the outcome to the connectivity belief either way.
 */
export async function withOfflineSnapshot<T>(
  storageKey: string,
  fetcher: () => Promise<T>,
  deps: SnapshotDeps = {}
): Promise<T> {
  const now = deps.now ?? Date.now;
  try {
    const value = await fetcher();
    reportOnline(now());
    void persistSnapshot(storageKey, value, now());
    return value;
  } catch (error) {
    reportOutcome(error, now());
    const snapshot = await readResourceSnapshot<T>(storageKey);
    if (snapshot === null) throw error;
    return snapshot.value;
  }
}

/** Test seam. */
export function resetResourceSnapshotsForTests(): void {
  lastWritten.clear();
}
