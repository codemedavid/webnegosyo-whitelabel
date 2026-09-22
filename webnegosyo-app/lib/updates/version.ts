// Comparing two app versions.
//
// Store versions are dotted numbers ("1.0.8"), and comparing them as text is
// wrong the moment a segment reaches double digits — "1.0.10" < "1.0.9" under
// string order. Every comparison here is numeric, segment by segment.
//
// The whole module fails OPEN: an unreadable version compares to nothing, so
// a typo in the release row can never be the reason a merchant is locked out
// of their register.

/** Missing segments count as zero, so "1.2" and "1.2.0" are one release. */
const SEGMENTS = 3;

/**
 * The numeric segments of a version, or null when it is not a version at all.
 * A trailing build/prerelease suffix ("1.0.8-beta.2") is dropped: the stores
 * carry it, and it never changes which release the binary is.
 */
export function parseVersion(raw: string | null | undefined): number[] | null {
  if (typeof raw !== "string") return null;
  const core = raw.trim().split(/[-+]/)[0];
  if (core === "") return null;

  const parts = core.split(".");
  if (parts.length > SEGMENTS) return null;

  const segments: number[] = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    segments.push(Number(part));
  }
  while (segments.length < SEGMENTS) segments.push(0);
  return segments;
}

/**
 * -1 / 0 / 1 in the usual sense, or null when either side is unreadable —
 * callers must decide what "cannot tell" means rather than being handed a
 * silent 0.
 */
export function compareVersions(
  a: string | null | undefined,
  b: string | null | undefined
): number | null {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return null;

  for (let i = 0; i < SEGMENTS; i += 1) {
    if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1;
  }
  return 0;
}

/** True only when `current` is provably behind `other`. Unreadable is false. */
export function isOlderThan(
  current: string | null | undefined,
  other: string | null | undefined
): boolean {
  return compareVersions(current, other) === -1;
}
