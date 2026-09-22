// What, if anything, to say to a merchant about updating — and how hard.
//
// Two mechanisms sit behind one prompt, because a merchant should not have to
// know which kind of update they are being offered:
//
//   OTA    A JS-only update already published to this binary's runtime lane.
//          Tapping "Update" really does update: expo-updates fetches it and
//          reloads. No store, no download screen, seconds.
//
//   Store  A new binary. iOS cannot self-install, so tapping "Update" can
//          only open the store page. This is the expensive path, which is why
//          it is offered second and only blocks when the platform says the
//          running build is no longer supported.
//
// Everything here is pure: the hook supplies the running version, the release
// row, the OTA check result and what was last dismissed.

import { isOlderThan, parseVersion } from "./version";

/** The platform's published policy for one store, as the app reads it. */
export interface AppRelease {
  latestVersion: string;
  minimumVersion: string;
  storeUrl: string;
  releaseNotes: string | null;
}

/** The outcome of an expo-updates check, flattened. */
export interface OtaStatus {
  isAvailable: boolean;
  updateId: string | null;
}

export type UpdatePrompt =
  | { kind: "none" }
  | {
      kind: "ota";
      /** Identifies this offer, so a dismissal survives a relaunch. */
      signature: string;
      isBlocking: false;
      releaseNotes: string | null;
    }
  | {
      kind: "store";
      signature: string;
      /** True when the running build is below the supported floor. */
      isBlocking: boolean;
      version: string;
      storeUrl: string;
      releaseNotes: string | null;
    };

export interface UpdatePromptInput {
  /** The running binary's version, from expo-constants. */
  currentVersion: string | null;
  release: AppRelease | null;
  ota: OtaStatus;
  /** The signature of the last prompt this device waved away. */
  dismissedSignature: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * A release row as an `AppRelease`, or null when it is not usable.
 *
 * A malformed row must read as "the platform has published no policy", never
 * as a floor nobody can clear — including the one mistake that would do the
 * most damage, a minimum above the latest shipped version.
 */
export function parseAppRelease(row: unknown): AppRelease | null {
  if (!isRecord(row)) return null;

  const latestVersion = readString(row.latest_version);
  const minimumVersion = readString(row.minimum_version);
  const storeUrl = readString(row.store_url);
  if (!latestVersion || !minimumVersion || !storeUrl) return null;
  if (!parseVersion(latestVersion) || !parseVersion(minimumVersion)) return null;
  if (isOlderThan(latestVersion, minimumVersion)) return null;

  return {
    latestVersion,
    minimumVersion,
    storeUrl,
    releaseNotes: readString(row.release_notes),
  };
}

/**
 * The single prompt to show, in priority order:
 *
 *   1. An unsupported binary blocks. An OTA cannot rescue it — OTA updates
 *      are scoped to the runtime version the binary already carries — so the
 *      store trip is the only way forward and there is nothing to negotiate.
 *   2. A waiting OTA update, because it is one tap and costs the merchant
 *      nothing.
 *   3. A newer binary in the store, dismissible.
 */
export function decideUpdatePrompt(input: UpdatePromptInput): UpdatePrompt {
  const { currentVersion, release, ota, dismissedSignature } = input;

  if (release && isOlderThan(currentVersion, release.minimumVersion)) {
    return {
      kind: "store",
      signature: `store:${release.latestVersion}`,
      isBlocking: true,
      version: release.latestVersion,
      storeUrl: release.storeUrl,
      releaseNotes: release.releaseNotes,
    };
  }

  if (ota.isAvailable) {
    const signature = `ota:${ota.updateId ?? "pending"}`;
    if (signature !== dismissedSignature) {
      return {
        kind: "ota",
        signature,
        isBlocking: false,
        releaseNotes: release?.releaseNotes ?? null,
      };
    }
  }

  if (release && isOlderThan(currentVersion, release.latestVersion)) {
    const signature = `store:${release.latestVersion}`;
    if (signature !== dismissedSignature) {
      return {
        kind: "store",
        signature,
        isBlocking: false,
        version: release.latestVersion,
        storeUrl: release.storeUrl,
        releaseNotes: release.releaseNotes,
      };
    }
  }

  return { kind: "none" };
}

/** The slice of auth state that decides whether the gate runs at all. */
export interface UpdateSessionState {
  isAuthenticated: boolean;
  isDemo: boolean;
}

/**
 * Only a real signed-in session is checked.
 *
 * The demo account is excluded deliberately: App Review walks through it, and
 * a floor set above the build under review would greet the reviewer with a
 * wall they cannot clear — the app would be rejected for being unusable.
 */
export function shouldCheckForUpdates(state: UpdateSessionState): boolean {
  return state.isAuthenticated && !state.isDemo;
}
