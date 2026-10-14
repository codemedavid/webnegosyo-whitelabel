/**
 * What the Team screen sends when an owner flips one permission switch.
 *
 * A row with `permissions: null` means full access, and the screen renders
 * every switch on for it. Toggling one used to send `[key]` — the one key —
 * which silently revoked everything else. The effective list has to be made
 * explicit first, then edited.
 */

import { OPT_IN_PERMISSION_KEYS, STAFF_PERMISSION_KEYS } from "./staff-permissions";

const FULL_ACCESS_KEYS = STAFF_PERMISSION_KEYS.filter(
  (key) => !(OPT_IN_PERMISSION_KEYS as readonly string[]).includes(key),
);
import {
  effectivePermissions,
  toggleEffectivePermission,
  togglePermission,
} from "./team-permissions";

describe("effectivePermissions", () => {
  it("expands null (full access) to every registry key except the opt-in ones, in registry order", () => {
    expect(effectivePermissions(null)).toEqual(FULL_ACCESS_KEYS);
  });

  it("never turns full access into an opt-in grant the owner did not tick", () => {
    // Flipping Kitchen off on a full-access row must not quietly hand the
    // account "See store activity" or "Approve requests".
    const next = toggleEffectivePermission(null, "kitchen");
    expect(next).not.toContain("activity_view");
    expect(next).not.toContain("approve_requests");
  });

  it("lets an owner switch an opt-in key on for a full-access row", () => {
    expect(toggleEffectivePermission(null, "activity_view")).toEqual([...FULL_ACCESS_KEYS, "activity_view"]);
  });

  it("returns a copy of an explicit list", () => {
    const held = ["orders", "pos"];
    const result = effectivePermissions(held);
    expect(result).toEqual(["orders", "pos"]);
    expect(result).not.toBe(held);
  });
});

describe("togglePermission", () => {
  it("adds a key that is not held", () => {
    expect(togglePermission(["orders"], "pos")).toEqual(["orders", "pos"]);
  });

  it("removes a key that is held without mutating the input", () => {
    const held = ["orders", "pos"];
    expect(togglePermission(held, "orders")).toEqual(["pos"]);
    expect(held).toEqual(["orders", "pos"]);
  });
});

describe("toggleEffectivePermission", () => {
  it("turning one switch off on a full-access account keeps every other grant", () => {
    // Arrange
    const expected = FULL_ACCESS_KEYS.filter((key) => key !== "kitchen");

    // Act
    const next = toggleEffectivePermission(null, "kitchen");

    // Assert — the whole list minus one, never `["kitchen"]`
    expect(next).toEqual(expected);
    expect(next).toHaveLength(FULL_ACCESS_KEYS.length - 1);
  });

  it("turning a switch on for an explicit list appends the key", () => {
    expect(toggleEffectivePermission(["orders"], "menu")).toEqual(["orders", "menu"]);
  });

  it("turning the last switch off yields an empty list for the screen to refuse", () => {
    expect(toggleEffectivePermission(["orders"], "orders")).toEqual([]);
  });
});
