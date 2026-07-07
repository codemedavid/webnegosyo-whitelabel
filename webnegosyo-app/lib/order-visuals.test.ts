import {
  getInitials,
  getAvatarColor,
  getUrgency,
  getUrgencyColor,
  getOrderTypeMeta,
  getStatusMeta,
  formatTimeAgo,
} from "./order-visuals";
import { colors } from "../theme/colors";

describe("getInitials", () => {
  it("takes the first and last word initials for multi-word names", () => {
    expect(getInitials("Juan Dela Cruz")).toBe("JC");
  });

  it("takes the first two letters for a single word", () => {
    expect(getInitials("Latte")).toBe("LA");
  });

  it("uppercases and trims surrounding/duplicate whitespace", () => {
    expect(getInitials("  maria   santos  ")).toBe("MS");
  });

  it("falls back to a placeholder for empty or blank names", () => {
    expect(getInitials("")).toBe("?");
    expect(getInitials("   ")).toBe("?");
  });

  it("handles a single-character name", () => {
    expect(getInitials("A")).toBe("A");
  });
});

describe("getAvatarColor", () => {
  it("returns a color from the avatar palette", () => {
    expect(colors.avatarPalette).toContain(getAvatarColor("Juan"));
  });

  it("is deterministic for the same seed", () => {
    expect(getAvatarColor("Maria Santos")).toBe(getAvatarColor("Maria Santos"));
  });

  it("falls back to the first palette entry for an empty seed", () => {
    expect(getAvatarColor("")).toBe(colors.avatarPalette[0]);
  });
});

describe("getUrgency", () => {
  const now = 1_700_000_000_000;

  it("marks a very recent order as fresh", () => {
    expect(getUrgency(now - 2 * 60_000, now)).toBe("fresh");
  });

  it("marks a mid-aged order as warning", () => {
    expect(getUrgency(now - 10 * 60_000, now)).toBe("warning");
  });

  it("marks an old order as urgent", () => {
    expect(getUrgency(now - 40 * 60_000, now)).toBe("urgent");
  });

  it("treats a future/invalid timestamp as fresh", () => {
    expect(getUrgency(now + 60_000, now)).toBe("fresh");
    expect(getUrgency(NaN, now)).toBe("fresh");
  });
});

describe("getUrgencyColor", () => {
  it("maps each urgency level to its token", () => {
    expect(getUrgencyColor("fresh")).toBe(colors.urgencyFresh);
    expect(getUrgencyColor("warning")).toBe(colors.urgencyWarning);
    expect(getUrgencyColor("urgent")).toBe(colors.urgencyUrgent);
  });
});

describe("getOrderTypeMeta", () => {
  it("maps delivery variants", () => {
    expect(getOrderTypeMeta("delivery").label).toBe("Delivery");
    expect(getOrderTypeMeta("Home Delivery").label).toBe("Delivery");
  });

  it("maps pickup and dine-in variants", () => {
    expect(getOrderTypeMeta("pickup").label).toBe("Pickup");
    expect(getOrderTypeMeta("dine-in").label).toBe("Dine-in");
  });

  it("title-cases an unknown type", () => {
    expect(getOrderTypeMeta("catering")).toEqual({ label: "Catering" });
  });

  it("falls back to a generic label when the type is missing", () => {
    expect(getOrderTypeMeta(undefined).label).toBe("Order");
  });

  it("returns a label-only shape with no emoji icon", () => {
    expect(getOrderTypeMeta("delivery")).toEqual({ label: "Delivery" });
    expect("icon" in getOrderTypeMeta("delivery")).toBe(false);
  });
});

describe("getStatusMeta", () => {
  it("returns the warm-toned pair and label for a known status", () => {
    const meta = getStatusMeta("preparing");
    expect(meta).toEqual({
      label: "Preparing",
      bg: colors.statusPreparing.bg,
      text: colors.statusPreparing.text,
    });
  });

  it("falls back to a neutral pair for an unknown status", () => {
    const meta = getStatusMeta("archived");
    expect(meta.label).toBe("Archived");
    expect(meta.bg).toBe(colors.separator);
  });
});

describe("formatTimeAgo", () => {
  const now = 1_700_000_000_000;

  it("shows 'Just now' under a minute", () => {
    expect(formatTimeAgo(now - 30_000, now)).toBe("Just now");
  });

  it("shows minutes, hours, then days", () => {
    expect(formatTimeAgo(now - 5 * 60_000, now)).toBe("5m ago");
    expect(formatTimeAgo(now - 3 * 3_600_000, now)).toBe("3h ago");
    expect(formatTimeAgo(now - 2 * 86_400_000, now)).toBe("2d ago");
  });
});
