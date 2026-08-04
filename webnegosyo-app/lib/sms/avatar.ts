/**
 * The identity mark on a guest row.
 *
 * `colors.avatarPalette` has been in the theme since the app was built, unused.
 * A roster of several hundred rows with no anchor is a wall of grey text, and
 * the merchant scanning it has one hand free and something on the stove.
 *
 * The colour must be a property of the guest, not of their position in the
 * list — a filter or a search that re-colours every row destroys the anchor it
 * was supposed to be.
 */

/**
 * "MS" for Maria Santos, "M" for Maria, "?" for a guest captured from a
 * Messenger order with no name at all.
 *
 * First and last only. Middle names are common here and three or four letters
 * stop fitting the circle.
 */
export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";

  const first = [...parts[0]][0] ?? "";
  if (parts.length === 1) return first.toUpperCase();

  const last = [...parts[parts.length - 1]][0] ?? "";
  return `${first}${last}`.toUpperCase();
}

/**
 * A stable palette slot for a guest id.
 *
 * FNV-1a rather than summing char codes: ids in this database are sequential
 * or UUID-like, and a sum maps `cust-1` and `cust-2` into adjacent buckets, so
 * a freshly seeded page comes out in one or two colours.
 */
export function avatarIndexFor(id: string, paletteSize: number): number {
  if (paletteSize <= 0) return 0;

  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    // >>> 0 after each round keeps this in unsigned 32-bit space; without it
    // the sign bit flips and neighbouring ids collide again.
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }

  return hash % paletteSize;
}
