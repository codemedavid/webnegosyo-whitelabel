// Plain-text building blocks for the cash slips (shift report, remittance
// slip, day close). Deliberately NOT the receipt-layout engine: that one is
// shaped around orders and pinned to the web copy, and a non-order document
// there would couple unrelated changes (07 §7.7). Like the kitchen chit, a
// slip is plain monospace text in one segment for the existing print path.
//
// Thermal heads print one byte per column in their own code page, so every
// slip is ASCII only: "P" for ₱ (as the receipts print it), "c" for ¢, "-" for
// the minus sign. Text typed by people (store, cashier, notes) is cleaned the
// same way and loses "<" / ">", which the print path reads as style tags.

import type { PrintSegment } from "../printer";

/** Text columns: 32 on a 58 mm roll, 48 on 80 mm (charsForPaperWidth). */
export type SlipWidth = 32 | 48;

/** Manila keeps +08:00 all year (no daylight saving), like lib/daily-report/business-day.ts. */
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

const REPLACEMENTS: readonly [RegExp, string][] = [
  [/₱/g, "P"],
  [/¢/g, "c"],
  [/[−–—]/g, "-"],
  [/[‘’]/g, "'"],
  [/[“”]/g, '"'],
  [/×/g, "x"],
  [/·/g, "-"],
  [/…/g, "..."],
  [/[<>]/g, ""],
];

function stripAccents(text: string): string {
  try {
    return text.normalize("NFD").replace(/[̀-ͯ]/g, "");
  } catch {
    return text;
  }
}

/** Anything a person typed → printable ASCII on one line. */
export function slipSafe(text: string | null | undefined): string {
  const replaced = REPLACEMENTS.reduce((out, [pattern, to]) => out.replace(pattern, to), stripAccents(text ?? ""));
  return replaced.replace(/\s+/g, " ").replace(/[^\x20-\x7E]/g, "?").trim();
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Centavos → "8,465.00" / "-120.00". Unknown (null) → "--". */
export function slipMoney(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return "--";
  const rounded = Math.round(cents);
  const absolute = Math.abs(rounded);
  const body = `${groupThousands(String(Math.floor(absolute / 100)))}.${String(absolute % 100).padStart(2, "0")}`;
  return rounded < 0 ? `-${body}` : body;
}

/** Centavos with an explicit sign: "+200.00", "-450.00", "0.00". */
export function slipSignedMoney(cents: number): string {
  return cents > 0 ? `+${slipMoney(cents)}` : slipMoney(cents);
}

export function truncate(text: string, width: number): string {
  return text.length <= width ? text : text.slice(0, Math.max(0, width));
}

export function center(text: string, width: SlipWidth): string {
  const line = truncate(text, width);
  return " ".repeat(Math.max(0, Math.floor((width - line.length) / 2))) + line;
}

export function divider(width: SlipWidth): string {
  return "-".repeat(width);
}

/** A bold centred title. `<B>` is the print path's bold tag; it takes no columns. */
export function title(text: string, width: SlipWidth): string {
  return `<B>${center(text, width)}</B>`;
}

/** A left-aligned bold section label ("PAID BY"). */
export function sectionLabel(text: string): string {
  return `<B>${text}</B>`;
}

/** "Label ........ value": the value keeps its columns, the label gives way. */
export function leftRight(left: string, right: string, width: SlipWidth): string {
  const value = truncate(right, width);
  const room = width - value.length - 1;
  if (room <= 0) return value;
  const label = truncate(left, room);
  return label + " ".repeat(width - label.length - value.length) + value;
}

/** Three columns: label, a short count, an amount ("GCash   14   4,210.00"). */
export function labelCountAmount(label: string, count: string, amount: string, width: SlipWidth): string {
  return leftRight(label, `${count.padStart(4)}  ${amount.padStart(width === 48 ? 14 : 11)}`, width);
}

/** Words onto lines no wider than the paper, each prefixed by `indent`. */
export function wrap(text: string, width: SlipWidth, indent = ""): string[] {
  const room = Math.max(1, width - indent.length);
  const words = text.split(" ").filter((word) => word.length > 0);
  const lines = words.reduce<string[]>((acc, word) => {
    const last = acc[acc.length - 1];
    if (last !== undefined && last.length + 1 + word.length <= room) return [...acc.slice(0, -1), `${last} ${word}`];
    const chunks = word.match(new RegExp(`.{1,${room}}`, "g")) ?? [];
    return [...acc, ...chunks];
  }, []);
  return lines.map((line) => indent + line);
}

/** Lines that are only `<B>` tags take no columns; everything else must fit. */
export function visibleLength(line: string): number {
  return line.replace(/<\/?B>/g, "").length;
}

interface ManilaParts {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
}

function manilaParts(at: Date): ManilaParts {
  const local = new Date(at.getTime() + MANILA_OFFSET_MS);
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth(),
    day: local.getUTCDate(),
    weekday: local.getUTCDay(),
    hour: local.getUTCHours(),
    minute: local.getUTCMinutes(),
  };
}

function toDate(at: string | Date): Date | null {
  const date = typeof at === "string" ? new Date(at) : at;
  return Number.isNaN(date.getTime()) ? null : date;
}

function clock({ hour, minute }: ManilaParts): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

/** "6:02 PM" in Manila time; "--" for an unreadable time. */
export function slipTime(at: string | Date): string {
  const date = toDate(at);
  return date ? clock(manilaParts(date)) : "--";
}

/** "6:02 PM Fri". */
export function slipTimeWithDay(at: string | Date): string {
  const date = toDate(at);
  if (!date) return "--";
  const parts = manilaParts(date);
  return `${clock(parts)} ${WEEKDAYS[parts.weekday]}`;
}

/** "Oct 25, 2026 2:50 AM" — when the slip was printed. */
export function slipStamp(at: Date): string {
  const date = toDate(at);
  if (!date) return "--";
  const parts = manilaParts(date);
  return `${MONTHS[parts.month]} ${parts.day}, ${parts.year} ${clock(parts)}`;
}

/** A business day key "2026-10-24" → "Fri, Oct 24, 2026" (the key as given; no clock involved). */
export function slipBusinessDay(dayKey: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey ?? "");
  if (!match) return "--";
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${WEEKDAYS[weekday]}, ${MONTHS[month - 1]} ${day}, ${year}`;
}

/** "6:02 PM Fri - 2:48 AM Sat", or "... - now" while the shift is open. */
export function slipWindow(from: string, to: string | null): string {
  return `${slipTimeWithDay(from)} - ${to ? slipTimeWithDay(to) : "now"}`;
}

/** Store name and branch, centred, as the head of every slip. */
export function slipHeader(storeName: string, branchName: string | undefined, heading: string, width: SlipWidth): string[] {
  const store = slipSafe(storeName).toUpperCase();
  const branch = slipSafe(branchName);
  return [
    ...(store ? [title(store, width)] : []),
    ...(branch ? [center(branch, width)] : []),
    title(heading, width),
  ];
}

/**
 * Printed where a figure was added up on this tablet (`source: "device"`:
 * a store whose sales aren't on the platform, or the server not reachable)
 * rather than by the server, so nobody mistakes it for the server's number.
 */
export const DEVICE_SOURCE_LINE = "Counted on this tablet";

/** Every slip ends this way: these are store papers, never a BIR document. */
export function slipFooter(width: SlipWidth, printedAt: Date): string[] {
  return [divider(width), center(`Printed ${slipStamp(printedAt)}`, width), center("Not an official receipt.", width), center("For store use.", width)];
}

/** The lines as the one text segment the print path takes (like the kitchen chit). */
export function toSlipSegments(lines: readonly string[]): PrintSegment[] {
  return [{ type: "text", text: `${lines.join("\n")}\n` }];
}

/** The slip's text without style tags — for an on-screen preview or a share. */
export function slipPlainText(segments: readonly PrintSegment[]): string {
  return segments
    .map((segment) => (segment.type === "text" ? segment.text.replace(/<\/?[CRBHW]>/g, "") : ""))
    .join("");
}
