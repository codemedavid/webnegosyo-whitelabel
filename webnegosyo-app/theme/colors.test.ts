import { colors, typography, spacing, radius, shadow } from "./colors";

/**
 * The merchant app theme must match the Branding Studio editorial design
 * language (web admin /admin/branding): deep charcoal ink, warm cream
 * background, coral accent, warm neutral borders — replacing the stock
 * iOS blue/gray palette.
 */
describe("Branding Studio theme tokens", () => {
  describe("core editorial palette", () => {
    it("uses the warm cream canvas as the app background", () => {
      expect(colors.background).toBe("#EFECE6");
    });

    it("uses deep charcoal ink as the primary color (buttons, emphasis)", () => {
      expect(colors.primary).toBe("#1D1815");
    });

    it("exposes the coral accent used for highlights and active states", () => {
      expect(colors.accent).toBe("#E4572E");
    });

    it("provides a soft coral tint for accent backgrounds", () => {
      expect(colors.accentLight).toBe("#FBEAE3");
    });

    it("uses charcoal ink for primary text (not pure black)", () => {
      expect(colors.textPrimary).toBe("#1D1815");
    });

    it("uses the warm taupe secondary text color from the studio", () => {
      expect(colors.textSecondary).toBe("#8B857B");
    });

    it("uses the warm panel border color for separators", () => {
      expect(colors.separator).toBe("#E5E0D6");
    });

    it("keeps cards white so they lift off the cream canvas", () => {
      expect(colors.card).toBe("#FFFFFF");
    });
  });

  describe("dark tab bar (icon rail)", () => {
    it("uses the charcoal rail background for the tab bar", () => {
      expect(colors.tabBar).toBe("#1D1815");
    });

    it("uses the amber active state from the studio rail", () => {
      expect(colors.tabBarActive).toBe("#F59E0B");
    });

    it("uses translucent white for inactive tab items", () => {
      expect(colors.tabBarInactive).toBe("rgba(255,255,255,0.55)");
    });
  });

  describe("semantic colors", () => {
    it("uses the emerald toggle green for success", () => {
      expect(colors.success).toBe("#047857");
    });

    it("uses the studio amber for warnings", () => {
      expect(colors.warning).toBe("#F59E0B");
    });

    it("keeps a distinct red for danger (not the coral accent)", () => {
      expect(colors.danger).toBe("#C0392B");
      expect(colors.danger).not.toBe(colors.accent);
    });

    it("provides light tints for every semantic color", () => {
      for (const key of [
        "successLight",
        "warningLight",
        "dangerLight",
        "infoLight",
      ] as const) {
        expect(colors[key]).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    });
  });

  describe("order status palette (warm-toned)", () => {
    const statusKeys = [
      "statusPending",
      "statusConfirmed",
      "statusPreparing",
      "statusReady",
      "statusDelivered",
      "statusCancelled",
    ] as const;

    it("keeps a bg/text pair for every order status", () => {
      for (const key of statusKeys) {
        expect(colors[key]).toEqual({
          bg: expect.stringMatching(/^#[0-9A-Fa-f]{6}$/),
          text: expect.stringMatching(/^#[0-9A-Fa-f]{6}$/),
        });
      }
    });

    it("uses the amber family for pending (matches studio active state)", () => {
      expect(colors.statusPending.text).toBe("#92400E");
    });

    it("uses the emerald family for ready", () => {
      expect(colors.statusReady.text).toBe("#065F46");
    });
  });

  describe("typography (editorial scale)", () => {
    it("uses a heavier extrabold title like the studio headers", () => {
      expect(typography.title).toEqual({ fontSize: 24, fontWeight: "800" });
    });

    it("uses bold section headings", () => {
      expect(typography.heading).toEqual({ fontSize: 17, fontWeight: "700" });
    });

    it("adds an uppercase eyebrow style for section labels", () => {
      expect(typography.eyebrow).toEqual({
        fontSize: 11,
        fontWeight: "700",
        letterSpacing: 1,
        textTransform: "uppercase",
      });
    });

    it("keeps body, caption and small styles", () => {
      expect(typography.body.fontSize).toBe(15);
      expect(typography.caption.fontSize).toBe(13);
      expect(typography.small.fontSize).toBe(11);
    });
  });

  describe("shape tokens", () => {
    it("uses the studio 10px default radius for cards", () => {
      expect(radius.md).toBe(10);
    });

    it("keeps input radius at 8 and pill radius available", () => {
      expect(radius.sm).toBe(8);
      expect(radius.full).toBe(9999);
    });

    it("keeps the 4px-base spacing scale intact", () => {
      expect(spacing).toEqual({
        xs: 4,
        sm: 8,
        md: 12,
        lg: 16,
        xl: 20,
        xxl: 24,
      });
    });

    it("uses warm-tinted shadows instead of pure black", () => {
      expect(shadow.sm.shadowColor).toBe("#1E160C");
      expect(shadow.md.shadowColor).toBe("#1E160C");
    });
  });
});
