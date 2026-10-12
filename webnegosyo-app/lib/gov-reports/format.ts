/**
 * How Senior/PWD figures are written on screen.
 *
 * Centavos are kept: these are tax figures an accountant will tick against
 * receipts, unlike the whole-peso comparison numbers elsewhere in the app.
 * Dates are Manila time — the store's legal day — whatever the phone says.
 */

import { GOV_DISCOUNT_RULES, type GovDiscountKind } from "../gov-discount";
import { formatPeso } from "../format";

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const NOON = 12;
const SHORT_ORDER_ID = 8;

/** `₱1,234.50`; negatives as `−₱1,234.50`. */
export function formatPesoCentavos(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const text = formatPeso(Math.abs(rounded));
  return rounded < 0 ? `−${text}` : text;
}

/**
 * "Oct 12, 2:30 PM" in Manila (with the year when `withYear`). Built by hand
 * rather than through Intl time zones, which Hermes does not always carry.
 */
export function formatManilaDateTime(iso: string, withYear = false): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "—";
  const manila = new Date(ms + MANILA_OFFSET_MS);
  const hours = manila.getUTCHours();
  const hour12 = hours % NOON === 0 ? NOON : hours % NOON;
  const minutes = String(manila.getUTCMinutes()).padStart(2, "0");
  const meridiem = hours < NOON ? "AM" : "PM";
  const date = `${MONTHS[manila.getUTCMonth()]} ${manila.getUTCDate()}`;
  const year = withYear ? `, ${manila.getUTCFullYear()}` : "";
  return `${date}${year}, ${hour12}:${minutes} ${meridiem}`;
}

export function kindCode(kind: GovDiscountKind): string {
  return GOV_DISCOUNT_RULES[kind].code;
}

export function kindLabel(kind: GovDiscountKind): string {
  return GOV_DISCOUNT_RULES[kind].label;
}

/** "#12", or a short form of the order id when the register sent no label. */
export function orderReference(claim: { orderLabel: string | null; externalOrderId: string }): string {
  if (claim.orderLabel) return claim.orderLabel;
  const id = claim.externalOrderId;
  return id.length > SHORT_ORDER_ID ? `…${id.slice(-SHORT_ORDER_ID)}` : id;
}

export function formatSalesCount(count: number): string {
  return `${count} ${Math.abs(count) === 1 ? "sale" : "sales"}`;
}
