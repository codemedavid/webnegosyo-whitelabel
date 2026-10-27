/**
 * Rules for accepting a remittance (06 §4.4, W2.2 `accept_remittance` /
 * `dispute_remittance`). The database is the boundary — a different amount
 * without a note is refused there too — so these only keep the receiver from
 * tapping into a refusal, in the same words.
 */
import { formatCents } from "../../lib/expenses/expense-format";
import { parsePesoInput } from "../../lib/expenses/keypad";

export const OFFLINE_LINE = "Accepting needs a connection.";
export const AMOUNT_NEEDED_LINE = "Type what you received.";
export const NOTE_NEEDED_LINE = "Add a note: what was different?";
export const REASON_NEEDED_LINE = 'Say what\'s wrong, for example "envelope short".';
export const BAD_AMOUNT_LINE = "Type an amount like 4,150";

export type AcceptCheck = { ok: true; receivedCents: number; note: string | null } | { ok: false; message: string };
/** `receivedCents` = what the receiver says arrived, if they typed it (dispute_remittance's p_received_cents). */
export type DisputeCheck = { ok: true; reason: string; receivedCents: number | null } | { ok: false; message: string };

/** "₱6,300 received. ₱45 less than the slip." — null when it matches or nothing was on the slip. */
export function differenceLine(handedOverCents: number | null, receivedCents: number | null): string | null {
  if (handedOverCents === null || receivedCents === null || receivedCents === handedOverCents) return null;
  const gap = Math.abs(receivedCents - handedOverCents);
  const side = receivedCents < handedOverCents ? "less" : "more";
  return `${formatCents(receivedCents, { compact: true })} received. ${formatCents(gap, { compact: true })} ${side} than the slip.`;
}

/** What the receiver may accept. A forced close (no slip amount) takes their count as it is. */
export function validateAccept(handedOverCents: number | null, receivedCents: number | null, note: string): AcceptCheck {
  if (receivedCents === null) return { ok: false, message: AMOUNT_NEEDED_LINE };
  const trimmed = note.trim();
  const isDifferent = handedOverCents !== null && receivedCents !== handedOverCents;
  if (isDifferent && trimmed === "") return { ok: false, message: NOTE_NEEDED_LINE };
  return { ok: true, receivedCents, note: trimmed || null };
}

/** A reason is required; the amount received is optional, but a typed one must read as pesos. */
export function validateDispute(reason: string, receivedText = ""): DisputeCheck {
  const trimmed = reason.trim();
  if (!trimmed) return { ok: false, message: REASON_NEEDED_LINE };
  if (receivedText.trim() === "") return { ok: true, reason: trimmed, receivedCents: null };
  const receivedCents = parsePesoInput(receivedText);
  return receivedCents === null ? { ok: false, message: BAD_AMOUNT_LINE } : { ok: true, reason: trimmed, receivedCents };
}
