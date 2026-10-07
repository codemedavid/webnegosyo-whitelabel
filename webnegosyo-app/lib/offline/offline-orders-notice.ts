/**
 * The one line the order screens show about the connection. Silent while
 * online with nothing waiting, so a healthy shop sees its screens unchanged.
 * Pure: the caller supplies the clock and the counts.
 */

import { formatSavedAge } from "./offline-ready-text";

export type OfflineOrdersTone = "offline" | "syncing" | "attention";

export interface OfflineOrdersNoticeInput {
  isOffline: boolean;
  /** When the saved list on screen was read live; null when it is live/in memory. */
  savedAt: number | null;
  now: number;
  /** Sales and order changes still to be written. */
  waiting: number;
  /** Refused too many times; need a person. */
  stuck: number;
}

export interface OfflineOrdersNotice {
  tone: OfflineOrdersTone;
  text: string;
}

const KEEP_WORKING = "Keep working — changes sync when you're back online.";

function updates(count: number): string {
  return `${count} order ${count === 1 ? "update" : "updates"}`;
}

export function offlineOrdersNotice(input: OfflineOrdersNoticeInput): OfflineOrdersNotice | null {
  if (input.isOffline) {
    const source =
      input.savedAt === null
        ? "showing orders on this device"
        : `orders as of ${formatSavedAge(input.savedAt, input.now)}`;
    const waiting = input.waiting > 0 ? `, plus ${input.waiting} not yet synced` : "";
    return { tone: "offline", text: `Offline · ${source}${waiting}. ${KEEP_WORKING}` };
  }
  if (input.stuck > 0) {
    return {
      tone: "attention",
      text: `${updates(input.stuck)} could not sync. Open the orders marked “Could not sync”.`,
    };
  }
  if (input.waiting > 0) return { tone: "syncing", text: `Syncing ${updates(input.waiting)}…` };
  return null;
}
