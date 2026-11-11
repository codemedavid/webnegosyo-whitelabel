/**
 * End shift & remit (06 §4.3), the decisions behind the four steps — count
 * cash, GCash & cards, result, remit — kept pure so every rule is tested:
 *
 * - The count is the cashier's; the expected figure and the verdict come from
 *   the server's `count_shift` AFTER the count (one recount, both kept).
 * - The draft (counts, answers, reason, float kept, step) is saved per shift,
 *   so a rush or a phone call mid-count never loses forty taps.
 * - Counting needs a connection and an empty outbox (sales and drawer expenses
 *   synced), or the expected figure would be missing them; remitting needs a
 *   connection. Offline, steps 1–2 still work and the draft is kept.
 */

import { countTotalCents, isValidCounts, type DenominationCounts } from "./denominations";
import { isVarianceReasonKey, type VarianceReasonKey } from "./reasons";
import type { NonCashAnswer } from "../../components/cash/non-cash";
import { parseCountResult, type NonCashMethod, type ShiftCountResult } from "./shift-close-parse";

export type EndShiftStep = "count" | "noncash" | "result" | "remit";
export const END_SHIFT_STEP_ORDER: readonly EndShiftStep[] = ["count", "noncash", "result", "remit"];

export const END_SHIFT_STEPS = [
  { key: "count", label: "Count cash" },
  { key: "noncash", label: "GCash & cards", doneLabel: "None today" },
  { key: "result", label: "Result" },
  { key: "remit", label: "Remit" },
] as const;

export type CountMode = "bills" | "total";

export interface EndShiftDraft {
  shiftId: string;
  step: EndShiftStep;
  mode: CountMode;
  counts: DenominationCounts;
  /** "Type total" amount. */
  typedCents: number | null;
  /** Shared NonCashCheck answers; null until the methods are known. */
  nonCash: readonly NonCashAnswer[] | null;
  reasonKey: VarianceReasonKey | null;
  note: string;
  /** Null = the default (the shift's float, or 0 on a zero-balance drawer). */
  floatKeptCents: number | null;
  /** What the server revealed for the last count sent; kept so a reopened tablet does not count again. */
  count: ShiftCountResult | null;
  /** The cashier chose Recount: the count is open for its second (last) attempt. */
  isRecounting: boolean;
  /** The first count, kept once a recount replaced it (the result says "Counted twice"). */
  firstCountedCents: number | null;
}

export function emptyDraft(shiftId: string, mode: CountMode): EndShiftDraft {
  return { shiftId, step: "count", mode, counts: {}, typedCents: null, nonCash: null, reasonKey: null, note: "", floatKeptCents: null, count: null, isRecounting: false, firstCountedCents: null };
}

/** What the cashier counted, by the mode they used; null = nothing entered yet. */
export function countedCentsOf(draft: EndShiftDraft): number | null {
  if (draft.mode === "total") return draft.typedCents;
  const total = countTotalCents(draft.counts);
  return total === null || (total === 0 && Object.keys(draft.counts).length === 0) ? null : total;
}

/** Once sent, a count is locked: only Recount (once) opens it again. */
export function isCountLocked(draft: EndShiftDraft): boolean {
  return draft.count !== null && !draft.isRecounting;
}

/** Recount: back to the count with what was counted, once. */
export function canRecount(draft: EndShiftDraft): boolean {
  return draft.count?.attempt === 1;
}

export function startRecount(draft: EndShiftDraft): EndShiftDraft {
  if (!canRecount(draft)) return draft;
  return { ...draft, isRecounting: true, step: "count", reasonKey: null };
}

/** The server's answer to a count: locked again, with the new figures. */
export function withCount(draft: EndShiftDraft, count: ShiftCountResult): EndShiftDraft {
  const firstCountedCents = count.attempt === 2 ? (draft.firstCountedCents ?? draft.count?.countedCents ?? null) : null;
  return { ...draft, count, isRecounting: false, firstCountedCents };
}

/** The steps this shift walks: GCash & cards drops out when nothing non-cash came in. */
export function stepsFor(methods: readonly NonCashMethod[] | null): EndShiftStep[] {
  const hasNonCash = (methods ?? []).some((m) => m.cents !== 0 || m.count > 0);
  return END_SHIFT_STEP_ORDER.filter((step) => step !== "noncash" || hasNonCash);
}

export function nextStep(steps: readonly EndShiftStep[], current: EndShiftStep): EndShiftStep | null {
  const index = steps.indexOf(current);
  return index >= 0 && index < steps.length - 1 ? steps[index + 1] : null;
}

export function previousStep(steps: readonly EndShiftStep[], current: EndShiftStep): EndShiftStep | null {
  const index = steps.indexOf(current);
  return index > 0 ? steps[index - 1] : null;
}

// ── Float and handover ─────────────────────────────────────────────────────

export interface FloatInput {
  openingFloatCents: number;
  isZeroBalance: boolean;
  countedCents: number;
  chosenCents: number | null;
}

/** Keep the shift's float for the next one (never more than is there); a zero-balance drawer ends empty. */
export function floatToKeep(input: FloatInput): number {
  if (input.isZeroBalance) return 0;
  const wanted = input.chosenCents ?? input.openingFloatCents;
  return Math.max(0, Math.min(wanted, input.countedCents));
}

export function handoverCents(countedCents: number, floatKeptCents: number): number {
  return Math.max(0, countedCents - floatKeptCents);
}

export function checkFloatKept(chosenCents: number, countedCents: number): string | null {
  if (chosenCents < 0) return "The float can't be less than ₱0.";
  if (chosenCents > countedCents) return "You can't keep more than you counted.";
  return null;
}

// ── Gates ──────────────────────────────────────────────────────────────────

export const END_SHIFT_COPY = {
  offlineCount: "Counting is checked with the store, so it needs a connection. Your count is saved on this tablet.",
  offlineRemit: "Remitting needs a connection. Your count is saved on this tablet — connect and tap Remit again.",
  nothingCounted: "Count the drawer, or type the total, first.",
  pickReason: "Pick what happened before you go on.",
  pickReceiver: "Choose who is receiving the cash.",
  waitingSales: (n: number) => `${n} ${n === 1 ? "sale is" : "sales are"} still waiting to sync. Connect to the internet, then count.`,
  waitingExpenses: (n: number) => `${n} drawer ${n === 1 ? "expense is" : "expenses are"} still waiting to sync. Connect to the internet, then count.`,
  leaveTitle: "Stop counting?",
  leaveMessage: "Your count is kept on this tablet.",
} as const;

export type Gate = { ok: true } | { ok: false; reason: string };

export interface CountGateInput {
  isOffline: boolean;
  pendingSales: number;
  waitingExpenses: number;
  countedCents: number | null;
}

/** May "Next" send the count? The expected figure must see every sale and pay-out first. */
export function canSubmitCount(input: CountGateInput): Gate {
  if (input.countedCents === null) return { ok: false, reason: END_SHIFT_COPY.nothingCounted };
  if (input.isOffline) return { ok: false, reason: END_SHIFT_COPY.offlineCount };
  if (input.pendingSales > 0) return { ok: false, reason: END_SHIFT_COPY.waitingSales(input.pendingSales) };
  if (input.waitingExpenses > 0) return { ok: false, reason: END_SHIFT_COPY.waitingExpenses(input.waitingExpenses) };
  return { ok: true };
}

/** May the result step move on? A reason when the server asks for one. */
export function canLeaveResult(count: ShiftCountResult | null, reasonKey: VarianceReasonKey | null): Gate {
  if (!count) return { ok: false, reason: END_SHIFT_COPY.nothingCounted };
  if (count.reasonRequired && !reasonKey) return { ok: false, reason: END_SHIFT_COPY.pickReason };
  return { ok: true };
}

export interface RemitGateInput {
  isOffline: boolean;
  /** RemitToPicker's own readiness (`isRemitReady`): a person (by PIN only when PIN can work) or the safe. */
  isTargetReady: boolean;
  /** off = nobody receives; optional = a receiver may be left out; required = must pick. */
  remittanceMode: "off" | "optional" | "required";
}

export function canRemit(input: RemitGateInput): Gate {
  if (input.isOffline) return { ok: false, reason: END_SHIFT_COPY.offlineRemit };
  if (input.remittanceMode !== "required" || input.isTargetReady) return { ok: true };
  return { ok: false, reason: END_SHIFT_COPY.pickReceiver };
}

// ── Draft (de)serialisation ────────────────────────────────────────────────

const DRAFT_VERSION = 1;

export function serializeDraft(draft: EndShiftDraft): string {
  return JSON.stringify({ v: DRAFT_VERSION, draft });
}

const CHECKS = ["pending", "matches", "different", "unchecked"];

function isWholeOrNull(value: unknown): boolean {
  return value === null || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0);
}

function isNonCashAnswer(value: unknown): value is NonCashAnswer {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.key === "string" &&
    typeof v.label === "string" &&
    typeof v.expectedCents === "number" &&
    typeof v.count === "number" &&
    CHECKS.includes(v.check as string) &&
    isWholeOrNull(v.declaredCents) &&
    typeof v.note === "string"
  );
}

/** A saved draft for THIS shift, or null for anything stale, foreign or tampered with. */
export function parseDraft(raw: string | null, shiftId: string): EndShiftDraft | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const box = parsed as { v?: unknown; draft?: Record<string, unknown> };
  const d = box?.draft;
  if (box?.v !== DRAFT_VERSION || !d || d.shiftId !== shiftId) return null;
  if (!END_SHIFT_STEP_ORDER.includes(d.step as EndShiftStep) || (d.mode !== "bills" && d.mode !== "total")) return null;
  if (!isValidCounts(d.counts)) return null;
  const typed = d.typedCents;
  if (typed !== null && !(typeof typed === "number" && Number.isSafeInteger(typed) && typed >= 0)) return null;
  const nonCash = d.nonCash;
  if (nonCash !== null && !(Array.isArray(nonCash) && nonCash.every(isNonCashAnswer))) return null;
  const floatKept = d.floatKeptCents;
  if (floatKept !== null && !(typeof floatKept === "number" && Number.isSafeInteger(floatKept) && floatKept >= 0)) return null;
  let count: ShiftCountResult | null = null;
  if (d.count !== null && d.count !== undefined) {
    try {
      count = parseCountResult(d.count);
    } catch {
      return null;
    }
  }
  return {
    shiftId,
    step: d.step as EndShiftStep,
    mode: d.mode,
    counts: d.counts,
    typedCents: typed as number | null,
    nonCash: nonCash as NonCashAnswer[] | null,
    reasonKey: isVarianceReasonKey(d.reasonKey) ? d.reasonKey : null,
    note: typeof d.note === "string" ? d.note : "",
    floatKeptCents: floatKept as number | null,
    count,
    isRecounting: d.isRecounting === true && count !== null,
    firstCountedCents:
      typeof d.firstCountedCents === "number" && Number.isSafeInteger(d.firstCountedCents) && d.firstCountedCents >= 0 ? d.firstCountedCents : null,
  };
}

/** One key per store + shift, so two stores on one tablet never share a count. */
export function draftStorageKey(tenantId: string, shiftId: string): string {
  return `cash.endShift.draft.v${DRAFT_VERSION}:${tenantId}:${shiftId}`;
}
