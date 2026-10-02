/**
 * The one line the register shows about its offline copy. Pure, so the
 * wording is tested without rendering (`components/pos/OfflineReadyStatus`).
 */

import type { OfflinePackManifest } from "./offline-pack";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export type OfflineReadyTone = "ok" | "neutral" | "warning";

export interface OfflineReadyStatus {
  tone: OfflineReadyTone;
  text: string;
  /** The tap that saves or refreshes the copy; null when there is none to offer. */
  actionLabel: string | null;
}

export interface OfflineReadyInput {
  /** The saved record has been read from the disk. */
  isLoaded: boolean;
  isDownloading: boolean;
  isOffline: boolean;
  /** Parts the last download could not save. */
  lastFailed: readonly string[];
  manifest: OfflinePackManifest | null;
  now: number;
}

function plural(count: number, noun: string): string {
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

export function formatSavedAge(savedAt: number, now: number): string {
  const age = Math.max(0, now - savedAt);
  if (age < MINUTE_MS) return "just now";
  if (age < HOUR_MS) return `${Math.floor(age / MINUTE_MS)} min ago`;
  if (age < DAY_MS) return `${Math.floor(age / HOUR_MS)} h ago`;
  return `${plural(Math.floor(age / DAY_MS), "day")} ago`;
}

function joinLabels(labels: readonly string[]): string {
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

function contents(manifest: OfflinePackManifest): string {
  const items = manifest.summary.items ?? 0;
  const methods = manifest.summary.paymentMethods ?? 0;
  return `${plural(items, "item")} · ${plural(methods, "payment method")}`;
}

export function offlineReadyStatus(input: OfflineReadyInput): OfflineReadyStatus | null {
  const { isLoaded, isDownloading, isOffline, lastFailed, manifest, now } = input;
  if (!isLoaded) return null;

  if (manifest) {
    const age = formatSavedAge(manifest.savedAt, now);
    if (isOffline) {
      return { tone: "ok", text: `Using the menu saved ${age} · ${contents(manifest)}`, actionLabel: null };
    }
    if (isDownloading) return { tone: "ok", text: "Updating the offline copy…", actionLabel: null };
    return { tone: "ok", text: `Ready offline · ${contents(manifest)} · saved ${age}`, actionLabel: "Update" };
  }

  if (isOffline) {
    return {
      tone: "warning",
      text: "Not saved for offline use yet — connect to the internet once to save the menu",
      actionLabel: null,
    };
  }
  if (isDownloading) {
    return {
      tone: "neutral",
      text: "Saving the menu and payment methods for offline use…",
      actionLabel: null,
    };
  }
  if (lastFailed.length > 0) {
    return {
      tone: "warning",
      text: `Not saved for offline use — could not download the ${joinLabels(lastFailed)}`,
      actionLabel: "Try again",
    };
  }
  return { tone: "warning", text: "Not saved for offline use yet", actionLabel: "Save now" };
}
