/**
 * The event detail sheet's facts (design spec §3.3): who, approver, when (the
 * one place seconds appear), where, reason, note, before → after. Raw JSON and
 * ids never appear; a change is shown in words ("₱185 → ₱195").
 */

import { ingredientHref, productHref } from "../navigation";
import { actorFirstName } from "./describe";
import { formatManilaDay, formatManilaTime, formatPeso, formatQuantity } from "./format";
import type { ActivityJson, StoreActivityEvent } from "./store-event";

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

const STATUS_WORDS: Readonly<Record<string, string>> = {
  pending: "Pending",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready",
  delivered: "Completed",
  cancelled: "Cancelled",
};

/** Kinds a customer starts when no staff member is attached. */
const CUSTOMER_KINDS: ReadonlySet<string> = new Set(["order.placed", "loyalty.reward_claimed", "loyalty.stamps_earned"]);

export interface DetailFact {
  label: string;
  value: string;
}

/** "Today, 12:41:07 PM" / "Tue 6 Oct, 8:05:09 AM" (Asia/Manila). */
export function whenWithSeconds(iso: string, nowIso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const local = new Date(ms + MANILA_OFFSET_MS);
  const seconds = String(local.getUTCSeconds()).padStart(2, "0");
  const time = formatManilaTime(iso).replace(/ (AM|PM)$/, `:${seconds} $1`);
  return `${formatManilaDay(iso, nowIso)}, ${time}`;
}

function num(json: ActivityJson | null, key: string): number | null {
  const value = json?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(json: ActivityJson | null, key: string): string | null {
  const value = json?.[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function change(event: StoreActivityEvent): string | null {
  const price = [num(event.before, "price") ?? num(event.before, "salePrice"), num(event.after, "price") ?? num(event.after, "salePrice")];
  if (price[0] !== null && price[1] !== null) return `${formatPeso(price[0])} → ${formatPeso(price[1])}`;
  const status = [text(event.before, "status"), text(event.after, "status")];
  if (status[0] && status[1]) return `${STATUS_WORDS[status[0]] ?? status[0]} → ${STATUS_WORDS[status[1]] ?? status[1]}`;
  const quantity = [num(event.before, "quantity"), num(event.after, "quantity")];
  if (quantity[0] !== null && quantity[1] !== null) {
    const unit = event.unit ? ` ${event.unit}` : "";
    return `${formatQuantity(quantity[0])}${unit} → ${formatQuantity(quantity[1])}${unit}`;
  }
  return null;
}

function whoOf(event: StoreActivityEvent): string {
  if (event.actorName) return event.actorName;
  return CUSTOMER_KINDS.has(event.kind) ? "Customer" : "System";
}

export function detailFacts(event: StoreActivityEvent, nowIso: string): DetailFact[] {
  const facts: (DetailFact | null)[] = [
    { label: "Who", value: whoOf(event) },
    event.approvedByName ? { label: "Approved by", value: event.approvedByName } : null,
    { label: "When", value: whenWithSeconds(event.occurredAt, nowIso) },
    event.outletName ? { label: "Where", value: event.outletName } : null,
    event.reason ? { label: "Reason", value: event.reason } : null,
    event.note ? { label: "Note", value: `“${event.note}”` } : null,
  ];
  const before = change(event);
  return [...facts, before ? { label: "Before → after", value: before } : null].filter(
    (fact): fact is DetailFact => fact !== null && fact.value !== "",
  );
}

export function reviewedLine(event: StoreActivityEvent): string | null {
  if (!event.reviewedAt) return null;
  const who = actorFirstName(event.reviewedByName) ?? "the owner";
  return `Reviewed by ${who} · ${formatManilaTime(event.reviewedAt)}`;
}

export interface ReviewViewer {
  userId: string | null;
  isOwner: boolean;
  isFullViewer: boolean;
}

/** Mirrors mark_store_activity_reviewed: full view, open flag, never your own row unless owner. */
export function canReviewEvent(event: StoreActivityEvent, viewer: ReviewViewer): boolean {
  if (!viewer.isFullViewer || event.flags.length === 0 || event.reviewedAt !== null) return false;
  return viewer.isOwner || event.actorUserId === null || event.actorUserId !== viewer.userId;
}

export interface OpenTarget {
  label: string;
  href: string;
}

/** The screen a row is about, when the app has one. */
export function openTarget(event: StoreActivityEvent): OpenTarget | null {
  if (!event.subjectRef) return null;
  switch (event.subjectType) {
    case "order":
      return { label: event.orderNumber ? `Open order ${event.orderNumber}` : "Open order", href: `/(main)/order/${encodeURIComponent(event.subjectRef)}` };
    case "ingredient":
      return { label: "Open item", href: ingredientHref(event.subjectRef) };
    case "menu_item":
      return { label: "Open item", href: productHref(event.subjectRef) };
    case "expense":
      return { label: "Open expense", href: `/(main)/expense/${encodeURIComponent(event.subjectRef)}` };
    default:
      return null;
  }
}
