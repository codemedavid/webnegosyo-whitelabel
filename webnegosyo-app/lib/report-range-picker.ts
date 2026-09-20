/**
 * What a tap on the report calendar means.
 *
 * Kept out of the component because "is this range finished yet?" is the whole
 * behaviour of the picker: a range needs two taps, the merchant may tap the
 * later day first, and switching between single-day and range must not throw
 * away the tap they just made. That is a state machine, and a state machine
 * belongs somewhere it can be tested without a renderer.
 *
 * A draft is DELIBERATELY not a `ReportSelection`: a half-built range is not a
 * window anyone can be shown. `draftSelection` returns null until the merchant
 * has actually said something complete, which is what keeps Apply inert rather
 * than quietly applying half a range.
 */

import { clampSelection, reportTodayKey, type ReportSelection } from "./report-window";

export type DraftMode = "day" | "range";

export interface PickerDraft {
  mode: DraftMode;
  /** First tap of a range, or the single picked day. */
  fromKey?: string;
  /** Second tap of a range. Absent while the range is still half-built. */
  toKey?: string;
}

function todayKeyOf(nowMs: number): string {
  return reportTodayKey(new Date(nowMs).toISOString());
}

/** The draft the sheet opens on, carrying over whatever is on screen. */
export function beginDraft(selection: ReportSelection, nowMs: number): PickerDraft {
  const safe = clampSelection(selection, nowMs);

  if (safe.kind === "day") return { mode: "day", fromKey: safe.dayKey, toKey: safe.dayKey };
  if (safe.kind === "range") return { mode: "range", fromKey: safe.fromKey, toKey: safe.toKey };

  // A preset names no day to carry over. Opening on one would invite the
  // merchant to hit Apply and get a day they never chose.
  return { mode: "day" };
}

/** Switch between picking one day and picking a range, keeping the first tap. */
export function setDraftMode(draft: PickerDraft, mode: DraftMode): PickerDraft {
  if (mode === draft.mode) return draft;

  // Going either way, the START day survives: it is the one the merchant
  // chose first and the one both modes can use.
  if (mode === "range") return { mode: "range", fromKey: draft.fromKey };
  return { mode: "day", fromKey: draft.fromKey, toKey: draft.fromKey };
}

/** Apply a tap on `dayKey`. Future days are ignored. */
export function tapDay(draft: PickerDraft, dayKey: string, nowMs: number): PickerDraft {
  // The cell is rendered disabled, but a tap must never slip through: a future
  // report is empty, and an empty report is indistinguishable from one whose
  // data went missing.
  if (dayKey > todayKeyOf(nowMs)) return draft;

  if (draft.mode === "day") return { mode: "day", fromKey: dayKey, toKey: dayKey };

  // A finished range, or no range yet: this tap starts a new one.
  if (draft.fromKey === undefined || draft.toKey !== undefined) {
    return { mode: "range", fromKey: dayKey };
  }

  // Second tap closes it. Tapping the later day first is the normal way to use
  // a calendar, so the pair is ordered rather than refused.
  const [fromKey, toKey] =
    dayKey >= draft.fromKey ? [draft.fromKey, dayKey] : [dayKey, draft.fromKey];
  return { mode: "range", fromKey, toKey };
}

/** The selection this draft would apply, or null while it is incomplete. */
export function draftSelection(draft: PickerDraft): ReportSelection | null {
  if (draft.fromKey === undefined) return null;

  if (draft.mode === "day") return { kind: "day", dayKey: draft.fromKey };
  if (draft.toKey === undefined) return null;
  return { kind: "range", fromKey: draft.fromKey, toKey: draft.toKey };
}

/** True when `dayKey` should render as chosen — both ends and everything between. */
export function isDayInDraft(draft: PickerDraft, dayKey: string): boolean {
  if (draft.fromKey === undefined) return false;
  if (draft.toKey === undefined) return dayKey === draft.fromKey;
  return dayKey >= draft.fromKey && dayKey <= draft.toKey;
}
