// The decisions around an expo-updates check, kept apart from the native
// module so they can be tested under node. `ota.ts` is the thin shell that
// calls into expo-updates and hands its results here.

import type { OtaStatus } from "./gate";

/** The slice of the expo-updates module the check decision depends on. */
export interface OtaRuntime {
  isEnabled: boolean;
  isDev: boolean;
}

/**
 * Metro owns the bundle in development, and `isEnabled` is false in Expo Go
 * and in any build made without an updates URL. Checking in either case
 * throws or offers to replace the code being edited.
 */
export function shouldCheckOta(runtime: OtaRuntime): boolean {
  return runtime.isEnabled && !runtime.isDev;
}

/** The shape of `Updates.checkForUpdateAsync()`, narrowed to what matters. */
export interface OtaCheckResult {
  isAvailable: boolean;
  isRollBackToEmbedded?: boolean;
  manifest?: { id?: string } | undefined;
}

/**
 * A check result as an offer. A rollback directive arrives as "not available"
 * already; it is spelled out here so the intent survives a future refactor.
 */
export function otaStatusFromCheck(result: OtaCheckResult): OtaStatus {
  if (!result.isAvailable || result.isRollBackToEmbedded) {
    return { isAvailable: false, updateId: null };
  }
  return { isAvailable: true, updateId: result.manifest?.id ?? null };
}

/** The shape of `Updates.fetchUpdateAsync()`, narrowed to what matters. */
export interface OtaFetchResult {
  isNew: boolean;
  isRollBackToEmbedded?: boolean;
}

/**
 * Only restart once a genuinely new bundle landed. Reloading into the same
 * code reads to a merchant as an update that silently failed.
 */
export function shouldReloadAfterFetch(result: OtaFetchResult): boolean {
  return result.isNew && !result.isRollBackToEmbedded;
}
