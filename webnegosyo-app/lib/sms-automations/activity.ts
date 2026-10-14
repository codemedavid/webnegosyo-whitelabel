/**
 * The Activity tab's filters and how each text's status reads. Pure.
 *
 * Each filter is a set of outbox statuses the SERVER filters by, so every page
 * is full: "Not sent" (skipped, failed, cancelled, expired) on a store whose
 * history is mostly sent texts still shows thirty failures, not an empty page.
 */

import type { OutboxStatus } from "./api";

export type ActivityFilter = "all" | "waiting" | "sent" | "not_sent";

export const ACTIVITY_FILTERS: readonly { label: string; value: ActivityFilter }[] = [
  { label: "All", value: "all" },
  { label: "Waiting", value: "waiting" },
  { label: "Sent", value: "sent" },
  { label: "Not sent", value: "not_sent" },
];

const NOT_SENT: readonly OutboxStatus[] = ["skipped", "failed", "cancelled", "expired"];

const WAITING: readonly OutboxStatus[] = ["queued", "claimed"];

/** The statuses the server filters this tab by; undefined = every text. */
export function serverStatusesFor(filter: ActivityFilter): OutboxStatus[] | undefined {
  if (filter === "waiting") return [...WAITING];
  if (filter === "sent") return ["sent"];
  if (filter === "not_sent") return [...NOT_SENT];
  return undefined;
}

export function keepsStatus(filter: ActivityFilter, status: OutboxStatus): boolean {
  if (filter === "not_sent") return NOT_SENT.includes(status);
  if (filter === "waiting") return WAITING.includes(status);
  if (filter === "sent") return status === "sent";
  return true;
}

/** A reason line belongs under texts that did not go out. */
export function showsReason(status: OutboxStatus): boolean {
  return NOT_SENT.includes(status);
}

export type StatusTone = "good" | "waiting" | "bad" | "muted";

export function statusTone(status: OutboxStatus): StatusTone {
  if (status === "sent") return "good";
  if (status === "queued" || status === "claimed") return "waiting";
  if (status === "failed") return "bad";
  return "muted";
}
