/**
 * How a voucher reads on the merchant's phone.
 *
 * The database stores a voucher as a switch, a window and a counter. A
 * merchant thinks of it as one of five states — running, not started yet,
 * finished, used up, or switched off — and every list, pill and ticket on the
 * Vouchers screens has to agree on which one. This module is that one answer,
 * plus the short phrases that describe the deal.
 *
 * Pure: the clock is passed in, so a screen and its test read the same state.
 * Dates are formatted with the device's local clock, which for a merchant is
 * the shop's own.
 */

import { formatPeso } from "../format";
import type { Voucher } from "../vouchers/types";

export type VoucherStatus = "live" | "scheduled" | "expired" | "used_up" | "retired";

/** The three tabs on the list, plus "all" for search. */
export type VoucherFilter = "live" | "upcoming" | "ended" | "all";

export type StatusTone = "success" | "info" | "warning" | "muted";

export const STATUS_PRESENTATION: Readonly<
  Record<VoucherStatus, { label: string; tone: StatusTone }>
> = {
  live: { label: "Live", tone: "success" },
  scheduled: { label: "Scheduled", tone: "info" },
  expired: { label: "Expired", tone: "muted" },
  used_up: { label: "Used up", tone: "warning" },
  retired: { label: "Switched off", tone: "muted" },
};

const FILTER_OF_STATUS: Readonly<Record<VoucherStatus, Exclude<VoucherFilter, "all">>> = {
  live: "live",
  scheduled: "upcoming",
  expired: "ended",
  used_up: "ended",
  retired: "ended",
};

const DAY_MS = 24 * 60 * 60 * 1000;
/** Inside this many days the end is counted down ("Ends in 3 days"), past it the date is named. */
const COUNTDOWN_DAYS = 7;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Epoch ms, or null for an absent or unreadable date — never "expired" by accident. */
function toMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/** Whole pesos without centavos; centavos only when there are some. */
export function formatAmount(amount: number): string {
  return formatPeso(amount, Number.isInteger(amount) ? 0 : 2);
}

/** "Sep 20" in the device's local time. */
export function formatShortDate(ms: number): string {
  const date = new Date(ms);
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

function startOfLocalDay(ms: number): number {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Switched off wins over everything: a retired code is refused at every till
 * whatever its dates say. Used up comes next because it is final, where a
 * window is only a matter of time.
 */
export function voucherStatus(voucher: Voucher, now: Date): VoucherStatus {
  if (!voucher.isActive) return "retired";
  if (voucher.usageLimitTotal != null && voucher.usedCount >= voucher.usageLimitTotal) {
    return "used_up";
  }
  const endsMs = toMs(voucher.endsAt);
  if (endsMs !== null && now.getTime() > endsMs) return "expired";
  const startsMs = toMs(voucher.startsAt);
  if (startsMs !== null && now.getTime() < startsMs) return "scheduled";
  return "live";
}

export function countByFilter(
  vouchers: readonly Voucher[],
  now: Date,
): Record<VoucherFilter, number> {
  const counts: Record<VoucherFilter, number> = { live: 0, upcoming: 0, ended: 0, all: 0 };
  return vouchers.reduce((acc, voucher) => {
    const filter = FILTER_OF_STATUS[voucherStatus(voucher, now)];
    return { ...acc, [filter]: acc[filter] + 1, all: acc.all + 1 };
  }, counts);
}

/** The vouchers under one tab that match the search, in the order given. */
export function filterVouchers(
  vouchers: readonly Voucher[],
  filter: VoucherFilter,
  query: string,
  now: Date,
): Voucher[] {
  const needle = query.trim().toLowerCase();
  return vouchers.filter((voucher) => {
    if (filter !== "all" && FILTER_OF_STATUS[voucherStatus(voucher, now)] !== filter) return false;
    if (needle === "") return true;
    return (
      voucher.code.toLowerCase().includes(needle) || voucher.name.toLowerCase().includes(needle)
    );
  });
}

type DealFields = Pick<Voucher, "discountType" | "discountValue" | "maxDiscountAmount">;

/** "20% off, up to ₱100" — the shape of the deal, in one line. Same wording as the web card. */
export function describeDiscount(voucher: DealFields): string {
  if (voucher.discountType === "free_delivery") return "Free delivery";
  if (voucher.discountType === "fixed") return `${formatAmount(voucher.discountValue)} off`;
  const cap = voucher.maxDiscountAmount ? `, up to ${formatAmount(voucher.maxDiscountAmount)}` : "";
  return `${voucher.discountValue}% off${cap}`;
}

/** The ticket stub: a big figure and a small word under it. */
export function discountHeadline(voucher: DealFields): { value: string; unit: string } {
  if (voucher.discountType === "free_delivery") return { value: "FREE", unit: "DELIVERY" };
  const hasValue = Number.isFinite(voucher.discountValue) && voucher.discountValue > 0;
  if (voucher.discountType === "fixed") {
    return { value: hasValue ? formatAmount(voucher.discountValue) : "₱–", unit: "OFF" };
  }
  return { value: hasValue ? `${voucher.discountValue}%` : "–%", unit: "OFF" };
}

export function describeScope(voucher: Pick<Voucher, "scope" | "targetIds">): string {
  if (voucher.scope === "universal") return "Whole order";
  const count = voucher.targetIds?.length ?? 0;
  if (voucher.scope === "categories") return `${count} ${count === 1 ? "category" : "categories"}`;
  return `${count} ${count === 1 ? "product" : "products"}`;
}

/** The conditions worth a merchant's glance; an unrestricted code has none. */
export function describeRules(
  voucher: Pick<Voucher, "minOrderAmount" | "usageLimitPerCustomer" | "isStackable">,
): string[] {
  const rules: string[] = [];
  if (voucher.minOrderAmount && voucher.minOrderAmount > 0) {
    rules.push(`Min. order ${formatAmount(voucher.minOrderAmount)}`);
  }
  if (voucher.usageLimitPerCustomer) {
    const n = voucher.usageLimitPerCustomer;
    rules.push(`${n} ${n === 1 ? "use" : "uses"} per customer`);
  }
  if (voucher.isStackable) rules.push("Combines with other codes");
  return rules;
}

/** When the code runs, relative to now; null when it has no dates at all. */
export function describeWindow(
  voucher: Pick<Voucher, "startsAt" | "endsAt">,
  now: Date,
): string | null {
  const nowMs = now.getTime();
  const startsMs = toMs(voucher.startsAt);
  if (startsMs !== null && nowMs < startsMs) return `Starts ${formatShortDate(startsMs)}`;

  const endsMs = toMs(voucher.endsAt);
  if (endsMs === null) return null;
  if (nowMs > endsMs) return `Ended ${formatShortDate(endsMs)}`;

  const daysLeft = Math.round((startOfLocalDay(endsMs) - startOfLocalDay(nowMs)) / DAY_MS);
  if (daysLeft === 0) return "Ends today";
  if (daysLeft === 1) return "Ends tomorrow";
  if (daysLeft <= COUNTDOWN_DAYS) return `Ends in ${daysLeft} days`;
  return `Until ${formatShortDate(endsMs)}`;
}

export interface UsageProgress {
  used: number;
  /** Null = unlimited. */
  limit: number | null;
  remaining: number | null;
  /** 0..1 for a progress bar; null when there is no limit to measure against. */
  ratio: number | null;
}

export function usageProgress(voucher: Pick<Voucher, "usedCount" | "usageLimitTotal">): UsageProgress {
  const used = voucher.usedCount;
  const limit = voucher.usageLimitTotal ?? null;
  if (limit === null || limit <= 0) return { used, limit: null, remaining: null, ratio: null };
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    ratio: Math.min(1, used / limit),
  };
}

/** A ready-to-post line for Facebook or Messenger. */
export function voucherShareMessage(
  voucher: Voucher,
  storeName: string | null,
  now: Date,
): string {
  const where = storeName ? ` at ${storeName}` : "";
  const parts = [`Use code ${voucher.code} for ${describeDiscount(voucher)}${where}!`];
  if (voucher.minOrderAmount && voucher.minOrderAmount > 0) {
    parts.push(`Min. order ${formatAmount(voucher.minOrderAmount)}.`);
  }
  const window = describeWindow(voucher, now);
  if (window && !window.startsWith("Ended")) parts.push(`${window}.`);
  return parts.join(" ");
}
