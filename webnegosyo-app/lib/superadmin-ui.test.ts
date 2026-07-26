import {
  leadStatusTone,
  monogram,
  monogramColor,
  pluralize,
  tenantStatusTone,
} from "./superadmin-ui";
import { colors } from "../theme/colors";

describe("monogram", () => {
  it("takes the initial of the first two words", () => {
    expect(monogram("Webnegosyo Coffee")).toBe("WC");
  });

  it("ignores words past the second so the badge stays two glyphs", () => {
    expect(monogram("Kape At Bread House")).toBe("KA");
  });

  it("falls back to the first two letters of a single word", () => {
    expect(monogram("Kape")).toBe("KA");
  });

  it("uppercases a lowercase name", () => {
    expect(monogram("jollibee express")).toBe("JE");
  });

  it("collapses extra whitespace between words", () => {
    expect(monogram("  Manam   Cafe ")).toBe("MC");
  });

  it("returns a placeholder rather than an empty badge for a blank name", () => {
    // A tenant with no name must still render a badge of the same size,
    // otherwise the row height jumps.
    expect(monogram("")).toBe("?");
    expect(monogram("   ")).toBe("?");
  });

  it("handles a one-letter name without padding it out", () => {
    expect(monogram("K")).toBe("K");
  });
});

describe("monogramColor", () => {
  it("returns a color from the shared avatar palette", () => {
    expect(colors.avatarPalette).toContain(monogramColor("tenant-a"));
  });

  it("is deterministic for the same seed", () => {
    // The badge colour must not change between renders or refreshes —
    // superadmins recognise stores by colour when scanning the list.
    expect(monogramColor("tenant-a")).toBe(monogramColor("tenant-a"));
  });

  it("spreads different seeds across more than one palette entry", () => {
    const seeds = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const distinct = new Set(seeds.map(monogramColor));
    expect(distinct.size).toBeGreaterThan(1);
  });

  it("still returns a valid palette color for an empty seed", () => {
    expect(colors.avatarPalette).toContain(monogramColor(""));
  });
});

describe("leadStatusTone", () => {
  it("gives an in-progress lead a warm, attention-drawing tone", () => {
    expect(leadStatusTone("new")).toEqual({
      bg: colors.warningLight,
      text: colors.warning,
    });
  });

  it("marks a converted lead with the success tone", () => {
    expect(leadStatusTone("converted")).toEqual({
      bg: colors.successLight,
      text: colors.success,
    });
  });

  it("marks a lost lead with the danger tone", () => {
    expect(leadStatusTone("lost")).toEqual({
      bg: colors.dangerLight,
      text: colors.danger,
    });
  });

  it("distinguishes contacted and qualified from brand-new leads", () => {
    expect(leadStatusTone("contacted")).not.toEqual(leadStatusTone("new"));
    expect(leadStatusTone("qualified")).not.toEqual(leadStatusTone("new"));
  });

  it("falls back to a neutral tone for an unrecognised status", () => {
    // The DB CHECK could gain a status before the app ships; an unknown value
    // must render as a plain pill, never crash or render an invalid style.
    expect(leadStatusTone("archived")).toEqual({
      bg: colors.infoLight,
      text: colors.info,
    });
  });
});

describe("tenantStatusTone", () => {
  it("uses the success tone for an active restaurant", () => {
    expect(tenantStatusTone(true)).toEqual({
      bg: colors.successLight,
      text: colors.success,
    });
  });

  it("uses a muted tone for an inactive restaurant", () => {
    // Inactive is an ordinary state, not an error — danger red over-signals.
    expect(tenantStatusTone(false)).toEqual({
      bg: colors.primaryLight,
      text: colors.textSecondary,
    });
  });
});

describe("pluralize", () => {
  it("keeps the singular for exactly one", () => {
    expect(pluralize(1, "restaurant")).toBe("1 restaurant");
  });

  it("adds an s for zero", () => {
    expect(pluralize(0, "restaurant")).toBe("0 restaurants");
  });

  it("adds an s for many", () => {
    expect(pluralize(7, "lead")).toBe("7 leads");
  });

  it("accepts an explicit plural for irregular words", () => {
    expect(pluralize(2, "entry", "entries")).toBe("2 entries");
  });
});
