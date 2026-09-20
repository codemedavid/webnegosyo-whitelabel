/**
 * The one line Home shows about the drawer in someone's hands.
 *
 * Whether a shift is running is a fact the cashier checks constantly and the
 * owner checks first thing — and until now the only way to learn it was to
 * open the Drawer screen and wait for its orders to load. This is the answer
 * without the trip: open or not, and how long it has run.
 *
 * Pure, so the strip and any later surface (an owner's view of the floor, a
 * report) can never phrase the same shift two different ways.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** How Home phrases the shift. */
export interface ShiftStatusView {
  isOpen: boolean;
  title: string;
  detail: string;
}

/**
 * Elapsed time in the shape a cashier reads at a glance: minutes for the
 * first hour, then hours and minutes. Never negative — a device clock behind
 * the server must not render a shift that started in the future.
 */
export function formatShiftElapsed(ms: number): string {
  const safe = Number.isFinite(ms) && ms > 0 ? ms : 0;
  const hours = Math.floor(safe / HOUR_MS);
  const minutes = Math.floor((safe % HOUR_MS) / MINUTE_MS);
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

function formatClock(at: number): string {
  return new Date(at).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
}

/**
 * @param shift the open shift, or null when this person is not on one
 * @param nowMs the moment to measure against, injected so this stays pure
 */
export function describeShiftStatus(
  shift: { openedAt: string } | null,
  nowMs: number,
): ShiftStatusView {
  if (!shift) {
    return {
      isOpen: false,
      title: "Not clocked in",
      detail: "Count your float to start a shift",
    };
  }

  const openedAt = Date.parse(shift.openedAt);
  if (!Number.isFinite(openedAt)) {
    // The row exists, so the drawer is open; only its stamp is unreadable.
    return { isOpen: true, title: "On shift", detail: "Drawer open" };
  }

  return {
    isOpen: true,
    title: "On shift",
    detail: `Since ${formatClock(openedAt)} · ${formatShiftElapsed(nowMs - openedAt)}`,
  };
}
