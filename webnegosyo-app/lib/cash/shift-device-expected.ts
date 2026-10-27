/**
 * What THIS tablet worked out the drawer should hold, per open shift — the
 * Drawer's own expectation (`expectDrawer`), handed to End shift so
 * `count_shift(…, p_device_expected_cents)` receives it. The server keeps it
 * beside its own figure (shadow phase) and uses it where it cannot add up
 * the sales itself (orders not on the platform). In memory only: a figure is
 * only as good as the read it came from, so a restarted app re-reads the
 * Drawer before ending a shift.
 */

const figures = new Map<string, { cents: number; atMs: number }>();

/** A figure older than this is not trusted for a count (the Drawer re-reads every minute). */
export const DEVICE_EXPECTED_MAX_AGE_MS = 10 * 60_000;

export function rememberDeviceExpected(shiftId: string, cents: number | null, atMs: number = Date.now()): void {
  if (cents === null || !Number.isSafeInteger(cents)) {
    figures.delete(shiftId);
    return;
  }
  figures.set(shiftId, { cents, atMs });
}

export function deviceExpectedFor(shiftId: string, nowMs: number = Date.now()): number | null {
  const figure = figures.get(shiftId);
  if (!figure || nowMs - figure.atMs > DEVICE_EXPECTED_MAX_AGE_MS) return null;
  return figure.cents;
}

export function forgetDeviceExpected(shiftId: string): void {
  figures.delete(shiftId);
}
