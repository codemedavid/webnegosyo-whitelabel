/**
 * Identity marks for a guest roster.
 *
 * The theme has carried `colors.avatarPalette` — "deterministic avatar ring
 * palette for customer initials" — since the app was built, and nothing ever
 * used it. A roster of hundreds of rows with no identity anchor is a wall of
 * grey text; an initial in a consistent colour is what lets a merchant find the
 * row they were looking at ten seconds ago.
 *
 * Deterministic is the whole point: the same guest must get the same colour on
 * every load, or the anchor is noise.
 */

import { avatarIndexFor, initialsOf } from "./avatar";

describe("initialsOf", () => {
  it("takes the first letter of the first and last name", () => {
    expect(initialsOf("Maria Santos")).toBe("MS");
  });

  it("ignores the middle of a long name", () => {
    expect(initialsOf("Maria Clara de los Reyes")).toBe("MR");
  });

  it("gives a single letter for a single name", () => {
    expect(initialsOf("Maria")).toBe("M");
  });

  it("survives the extra spaces a merchant types", () => {
    expect(initialsOf("  maria   santos  ")).toBe("MS");
  });

  it("marks an unnamed guest rather than rendering an empty circle", () => {
    // Guests captured from a Messenger order often have no name at all.
    expect(initialsOf(null)).toBe("?");
    expect(initialsOf("")).toBe("?");
    expect(initialsOf("   ")).toBe("?");
  });

  it("keeps a non-Latin name's own letters", () => {
    expect(initialsOf("小明 王")).toBe("小王");
  });
});

describe("avatarIndexFor", () => {
  it("gives the same guest the same colour every time", () => {
    expect(avatarIndexFor("cust-42", 6)).toBe(avatarIndexFor("cust-42", 6));
  });

  it("stays inside the palette", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h", "long-uuid-style-id"];

    for (const id of ids) {
      const index = avatarIndexFor(id, 6);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(6);
    }
  });

  it("spreads neighbouring ids apart, so a page of rows is not one colour", () => {
    // Sequential ids are the common case in a seeded database. A hash that
    // maps them all to the same bucket makes the anchor useless.
    const indexes = new Set(
      ["cust-1", "cust-2", "cust-3", "cust-4"].map((id) => avatarIndexFor(id, 6))
    );

    expect(indexes.size).toBeGreaterThan(1);
  });

  it("never divides by an empty palette", () => {
    expect(avatarIndexFor("cust-1", 0)).toBe(0);
  });
});
