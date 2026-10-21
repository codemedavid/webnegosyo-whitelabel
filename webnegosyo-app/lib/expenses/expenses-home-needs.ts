/**
 * The "Needs you" card (design brief §1): only what the owner should act on,
 * each with the one tap that deals with it. Empty = the card is not drawn.
 *
 * Counts come from the whole window (before any filter), so the card does not
 * flicker as the owner filters the list.
 */

import type { IconName } from "../../components/Icon";
import { formatCents } from "./expense-format";
import type { HomeView } from "./expenses-home";
import type { HomeRow } from "./expenses-home-rows";
import { DEFAULT_NO_RECEIPT_THRESHOLD_CENTS } from "./flags";

export type NeedsYouAction = { kind: "sort" } | { kind: "view"; view: HomeView };
export type NeedsYouTone = "warning" | "accent" | "info" | "danger";

export interface NeedsYouItem {
  key: "unsorted" | "no_receipt" | "duplicate" | "phone";
  icon: IconName;
  tone: NeedsYouTone;
  title: string;
  detail: string;
  cta: string;
  action: NeedsYouAction;
}

export interface NeedsYouInput {
  /** The window's rows, unfiltered. */
  rows: readonly HomeRow[];
  unsortedCount: number;
  unsortedCents: number;
  /** The store's no-receipt threshold; defaults to the flag's default. */
  noReceiptThresholdCents?: number;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function unsortedItem(count: number, cents: number): NeedsYouItem {
  return {
    key: "unsorted",
    icon: "drawer",
    tone: "warning",
    title: `${plural(count, "drawer pay-out", "drawer pay-outs")} ${count === 1 ? "needs" : "need"} a category`,
    detail: `From older app versions · ${formatCents(cents, { compact: true })}`,
    cta: "Choose",
    action: { kind: "sort" },
  };
}

function noReceiptItem(count: number, thresholdCents: number): NeedsYouItem {
  const threshold = formatCents(thresholdCents, { compact: true });
  return {
    key: "no_receipt",
    icon: "receipt",
    tone: "accent",
    title: `${plural(count, "big expense", "big expenses")} ${count === 1 ? "has" : "have"} no receipt`,
    detail: count === 1 ? `${threshold} or more` : `${threshold} or more each`,
    cta: "See",
    action: { kind: "view", view: "no_receipt" },
  };
}

function duplicateItem(count: number): NeedsYouItem {
  return {
    key: "duplicate",
    icon: "duplicate",
    tone: "accent",
    title: `${plural(count, "expense", "expenses")} may be entered twice`,
    detail: "Same amount and category within 2 days",
    cta: "Check",
    action: { kind: "view", view: "check" },
  };
}

function phoneItem(waiting: number, refused: number): NeedsYouItem {
  if (refused > 0) {
    return {
      key: "phone",
      icon: "warning",
      tone: "danger",
      title: `${plural(refused, "expense was", "expenses were")} not sent`,
      detail: "Kept on this phone only. Tap one to see why.",
      cta: "See",
      action: { kind: "view", view: "check" },
    };
  }
  return {
    key: "phone",
    icon: "rotate",
    tone: "info",
    title: `${waiting} waiting to send`,
    detail: "Saved on this phone. They send when you are back online.",
    cta: "See",
    action: { kind: "view", view: "check" },
  };
}

export function needsYouItems(input: NeedsYouInput): NeedsYouItem[] {
  const recorded = input.rows.filter((row) => row.status === "recorded");
  const noReceipt = recorded.filter((row) => row.flags.includes("no_receipt")).length;
  const duplicates = recorded.filter((row) => row.flags.includes("possible_duplicate")).length;
  const waiting = input.rows.filter((row) => row.status === "waiting").length;
  const refused = input.rows.filter((row) => row.status === "refused").length;
  const items: NeedsYouItem[] = [];
  if (input.unsortedCount > 0) items.push(unsortedItem(input.unsortedCount, input.unsortedCents));
  if (noReceipt > 0) items.push(noReceiptItem(noReceipt, input.noReceiptThresholdCents ?? DEFAULT_NO_RECEIPT_THRESHOLD_CENTS));
  if (duplicates > 0) items.push(duplicateItem(duplicates));
  if (waiting + refused > 0) items.push(phoneItem(waiting, refused));
  return items;
}
