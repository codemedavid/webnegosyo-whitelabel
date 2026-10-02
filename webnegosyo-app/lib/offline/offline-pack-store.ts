/**
 * The offline download's shared state, outside React.
 *
 * The register's status line and the app-wide auto-sync both drive the same
 * download, so it lives here once: at most one download per register scope
 * (tenant + branch) at a time, the saved record read from the disk once, and a
 * listener set for `useSyncExternalStore` (`use-offline-pack.ts`). Every update
 * replaces the scope's state object rather than editing it, so a subscriber
 * comparing snapshots sees each change.
 */

import {
  downloadOfflinePack,
  offlinePackKey,
  readOfflinePackManifest,
  type OfflinePackManifest,
  type OfflinePackResult,
  type QueryDataWriter,
} from "./offline-pack";
import { registerPackParts, summarizeRegisterPack, type RegisterPackScope } from "./register-pack";

export interface OfflinePackState {
  /** The saved record has been read from the disk (or a download finished). */
  isLoaded: boolean;
  isDownloading: boolean;
  manifest: OfflinePackManifest | null;
  /** Parts the last download could not save; empty after a complete one. */
  lastFailed: string[];
}

const INITIAL_STATE: OfflinePackState = {
  isLoaded: false,
  isDownloading: false,
  manifest: null,
  lastFailed: [],
};

/** Named for the status line when the download failed in an unexpected way. */
const UNEXPECTED_FAILURE: readonly string[] = ["offline copy"];

let states = new Map<string, OfflinePackState>();
const lastAttemptAt = new Map<string, number>();
const inFlight = new Map<string, Promise<OfflinePackResult>>();
const manifestReads = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

function update(packKey: string, change: (state: OfflinePackState) => OfflinePackState): void {
  const next = new Map(states);
  next.set(packKey, change(getOfflinePackState(packKey)));
  states = next;
  listeners.forEach((listener) => listener());
}

export function getOfflinePackState(packKey: string): OfflinePackState {
  return states.get(packKey) ?? INITIAL_STATE;
}

export function subscribeOfflinePack(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** When this session last started a download for the scope; null for never. */
export function lastOfflinePackAttempt(packKey: string): number | null {
  return lastAttemptAt.get(packKey) ?? null;
}

/** Read the saved record once per scope per launch. */
export function loadOfflinePackManifest(packKey: string): Promise<void> {
  const existing = manifestReads.get(packKey);
  if (existing) return existing;
  const read = readOfflinePackManifest(packKey).then((manifest) => {
    update(packKey, (state) => ({
      ...state,
      isLoaded: true,
      // A download that finished first holds the newer record.
      manifest: state.manifest ?? manifest,
    }));
  });
  manifestReads.set(packKey, read);
  return read;
}

export interface RunOfflinePackDeps {
  client: QueryDataWriter;
  scope: RegisterPackScope;
  now?: () => number;
}

export function runOfflinePackDownload({ client, scope, now = Date.now }: RunOfflinePackDeps): Promise<OfflinePackResult> {
  const packKey = offlinePackKey(scope.tenantId, scope.outletId);
  const existing = inFlight.get(packKey);
  if (existing) return existing;

  lastAttemptAt.set(packKey, now());
  update(packKey, (state) => ({ ...state, isDownloading: true }));

  const work = downloadOfflinePack({
    client,
    parts: registerPackParts(scope),
    packKey,
    summarize: summarizeRegisterPack,
    now,
  })
    .then(
      (result) => {
        update(packKey, (state) => ({
          isLoaded: true,
          isDownloading: false,
          manifest: result.manifest ?? state.manifest,
          lastFailed: result.isComplete ? [] : result.failed,
        }));
        return result;
      },
      (error: unknown) => {
        console.warn("[offline] The offline download failed:", error);
        update(packKey, (state) => ({
          ...state,
          isLoaded: true,
          isDownloading: false,
          lastFailed: [...UNEXPECTED_FAILURE],
        }));
        return { isComplete: false, failed: [...UNEXPECTED_FAILURE], manifest: null };
      },
    )
    .finally(() => {
      inFlight.delete(packKey);
    });

  inFlight.set(packKey, work);
  return work;
}

/** Test seam. */
export function resetOfflinePackStoreForTests(): void {
  states = new Map();
  lastAttemptAt.clear();
  inFlight.clear();
  manifestReads.clear();
  listeners.clear();
}
