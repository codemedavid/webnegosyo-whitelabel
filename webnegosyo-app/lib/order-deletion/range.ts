/**
 * The report range picker's selection as the inclusive Manila days the
 * order-deletion routes take (`{ kind: "range", from, to }`).
 */
import { resolveReportWindow, type ReportSelection } from "../report-window";

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

function manilaDayKey(epochMs: number): string {
  return new Date(epochMs + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

export function selectionToDeletionRange(
  selection: ReportSelection,
  nowMs: number
): { from: string; to: string } {
  const window = resolveReportWindow(selection, nowMs);
  // The window is half-open; its last millisecond names the final day.
  return { from: manilaDayKey(window.startMs), to: manilaDayKey(window.endMs - 1) };
}
