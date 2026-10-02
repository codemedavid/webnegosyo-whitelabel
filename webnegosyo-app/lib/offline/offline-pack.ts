/**
 * The register's offline download: everything it needs to sell, saved up front.
 *
 * The snapshots in `resource-snapshot.ts` used to be written only as a side
 * effect of a screen reading while online. So a device that logged in and went
 * offline before anyone opened the register had no menu, and payment methods
 * were saved per order type — a till that had only charged Dine-in online had
 * nothing to offer a Takeout sale offline.
 *
 * This runs every register read at once (`register-pack.ts` lists them), puts
 * each answer into the live cache and onto the disk under the SAME keys the
 * screens read, and records a small manifest (when, and how much) the register
 * shows the cashier. It is honest: a part that could not be fetched or written
 * is named, and the manifest is only moved forward when every REQUIRED part
 * (menu, prices, payment methods) landed.
 *
 * No React here; the binding and the triggers live in `use-offline-pack.ts`.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ResourceQueryKey } from "../backends/query-keys";
import { reportOnline, reportOutcome } from "./connectivity";
import { resourceSnapshotKey, saveResourceSnapshot } from "./resource-snapshot";

export const OFFLINE_PACK_PREFIX = "offline_pack_v1:";

/**
 * A download part that has not answered in this long is given up on. Longer
 * than GoTrue's 30 s token-refresh retry ceiling: a flaky till mid-refresh is
 * exactly the device this download is for, and giving up first would mark a
 * reachable store's menu as failed.
 */
export const OFFLINE_PACK_TIMEOUT_MS = 40_000;

/** How old the saved copy may get before a return to the app refreshes it. */
export const OFFLINE_PACK_REFRESH_MS = 15 * 60_000;

/** The key segment for a store-wide register (no branch in scope). */
const STORE_WIDE = "store";

export interface OfflinePackPart {
  /** Merchant-facing name, e.g. "payment methods". */
  label: string;
  /** The cache key the screen reads — the snapshot is keyed from it. */
  key: ResourceQueryKey | readonly unknown[];
  fetch: () => Promise<unknown>;
  /** Without it the register cannot sell (menu, prices, payment methods). */
  isRequired: boolean;
}

export type OfflinePackSummary = Record<string, number>;

export interface OfflinePackManifest {
  savedAt: number;
  summary: OfflinePackSummary;
  /** Optional parts that were not saved this time. */
  missing: string[];
}

export interface OfflinePackResult {
  /** Every required part is on the disk. */
  isComplete: boolean;
  /** Labels of the parts that could not be fetched or saved. */
  failed: string[];
  /** The new manifest; null when the download was not complete. */
  manifest: OfflinePackManifest | null;
}

export interface QueryDataWriter {
  setQueryData: (key: readonly unknown[], value: unknown) => unknown;
}

export interface DownloadOfflinePackDeps {
  client: QueryDataWriter;
  parts: readonly OfflinePackPart[];
  packKey: string;
  /** Counts for the manifest, from the values fetched by label. */
  summarize: (values: ReadonlyMap<string, unknown>) => OfflinePackSummary;
  now?: () => number;
  timeoutMs?: number;
}

export function offlinePackKey(tenantId: string, outletId: string | null): string {
  return `${OFFLINE_PACK_PREFIX}${tenantId}:${outletId ?? STORE_WIDE}`;
}

function withTimeout<T>(work: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Saving the ${label} for offline use timed out.`)),
      timeoutMs,
    );
  });
  return Promise.race([work, deadline]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

type PartOutcome = { label: string; value: unknown } | { label: string; error: unknown };

async function savePart(
  part: OfflinePackPart,
  deps: DownloadOfflinePackDeps,
  savedAt: number,
): Promise<PartOutcome> {
  try {
    const value = await withTimeout(part.fetch(), deps.timeoutMs ?? OFFLINE_PACK_TIMEOUT_MS, part.label);
    deps.client.setQueryData(part.key, value);
    await saveResourceSnapshot(resourceSnapshotKey(part.key), value, savedAt);
    return { label: part.label, value };
  } catch (error) {
    return { label: part.label, error };
  }
}

export async function downloadOfflinePack(deps: DownloadOfflinePackDeps): Promise<OfflinePackResult> {
  const now = deps.now ?? Date.now;
  const savedAt = now();
  const outcomes = await Promise.all(deps.parts.map((part) => savePart(part, deps, savedAt)));

  const values = new Map<string, unknown>();
  const failed: string[] = [];
  outcomes.forEach((outcome) => {
    if ("error" in outcome) {
      failed.push(outcome.label);
      console.warn(`[offline] Could not save the ${outcome.label} for offline use:`, outcome.error);
    } else {
      values.set(outcome.label, outcome.value);
    }
  });

  // One sample for the connectivity belief: any answer means the server is
  // there; only a network failure with no answer at all means offline.
  const firstError = outcomes.find((outcome): outcome is { label: string; error: unknown } => "error" in outcome);
  if (values.size > 0) reportOnline(now());
  else if (firstError) reportOutcome(firstError.error, now());

  const requiredFailed = deps.parts.some((part) => part.isRequired && failed.includes(part.label));
  if (requiredFailed) return { isComplete: false, failed, manifest: null };

  const manifest: OfflinePackManifest = {
    savedAt,
    summary: deps.summarize(values),
    missing: failed,
  };
  try {
    await AsyncStorage.setItem(deps.packKey, JSON.stringify(manifest));
  } catch (error) {
    // The data itself is on the disk; only the "saved at" line is stale.
    console.warn("[offline] Could not record the offline download:", error);
  }
  return { isComplete: true, failed, manifest };
}

function isSummary(value: unknown): value is OfflinePackSummary {
  if (!value || typeof value !== "object") return false;
  return Object.values(value).every((count) => typeof count === "number");
}

export async function readOfflinePackManifest(packKey: string): Promise<OfflinePackManifest | null> {
  try {
    const raw = await AsyncStorage.getItem(packKey);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<OfflinePackManifest> | null;
    if (!parsed || typeof parsed.savedAt !== "number" || !isSummary(parsed.summary)) return null;
    const missing = Array.isArray(parsed.missing)
      ? parsed.missing.filter((label): label is string => typeof label === "string")
      : [];
    return { savedAt: parsed.savedAt, summary: parsed.summary, missing };
  } catch {
    return null;
  }
}

export type OfflinePackTrigger = "start" | "reconnect" | "foreground";

export interface RefreshDecision {
  reason: OfflinePackTrigger;
  /** When this session last tried to download this pack; null for never. */
  lastAttemptAt: number | null;
  now: number;
}

/**
 * Whether a trigger should download again. The register keeps its own reads
 * fresh while it is on screen; this only has to cover the device that has not
 * opened it — once per session, after every reconnect, and on a return to the
 * app once the copy has aged.
 */
export function shouldRefreshOfflinePack({ reason, lastAttemptAt, now }: RefreshDecision): boolean {
  if (lastAttemptAt === null) return true;
  if (reason === "reconnect") return true;
  if (reason === "foreground") return now - lastAttemptAt >= OFFLINE_PACK_REFRESH_MS;
  return false;
}
