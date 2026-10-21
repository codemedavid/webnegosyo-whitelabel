// Merchant admin app theme — ported from the web Branding Studio editorial
// design language (src/components/admin/branding-studio/*): deep charcoal
// ink, warm cream canvas, coral accent, warm neutral borders, dark icon
// rail with amber active states.

export const colors = {
  // Canvas & surfaces
  background: "#EFECE6",
  card: "#FFFFFF",
  surfaceSubtle: "#F7F5F0",

  // Brand
  primary: "#1D1815",
  primaryLight: "#EDEAE4",
  accent: "#E4572E",
  accentLight: "#FBEAE3",

  // Text
  textPrimary: "#1D1815",
  textSecondary: "#8B857B",
  // Meta lines that must stay readable: 5.52:1 on white, 4.68:1 on the canvas
  // (textSecondary is 3.66:1 / 3.10:1 — fails AA at 13pt). Store activity spec §0.3.
  textMuted: "#6E685E",
  textTertiary: "#B8B2A7",
  textOnDark: "#FFFFFF",

  // Borders
  separator: "#E5E0D6",

  // Tab bar (dark icon rail from the studio)
  tabBar: "#1D1815",
  tabBarBorder: "#2A241E",
  tabBarActive: "#F59E0B",
  tabBarInactive: "rgba(255,255,255,0.55)",

  // Semantic
  success: "#047857",
  successLight: "#E7F3EE",
  warning: "#F59E0B",
  warningLight: "#FBF1DD",
  danger: "#C0392B",
  dangerLight: "#F8E8E5",
  info: "#5B6472",
  infoLight: "#EDEFF2",

  // Order status pills (warm-toned)
  statusPending: { bg: "#FBF1DD", text: "#92400E" },
  statusConfirmed: { bg: "#EDEFF2", text: "#334155" },
  statusPreparing: { bg: "#FBEAE3", text: "#B23E1B" },
  statusReady: { bg: "#E7F3EE", text: "#065F46" },
  statusDelivered: { bg: "#EDEAE4", text: "#1D1815" },
  statusCancelled: { bg: "#F8E8E5", text: "#8C2A1E" },

  // Ink hero surface (dark revenue card on the cream canvas)
  heroInk: "#211B16",
  heroInkElevated: "#2E251E",
  heroInkText: "#FDFBF7",
  heroInkMuted: "rgba(253,251,247,0.62)",
  /** A saving shown on the ink surface (e.g. the Senior/PWD preview). */
  heroInkPositive: "#7FD3B0",

  /** The dimmed ground behind a bottom sheet. */
  scrim: "rgba(29,24,21,0.45)",

  // Urgency signal for the age of an active order (drives the card accent dot)
  urgencyFresh: "#047857",
  urgencyWarning: "#F59E0B",
  urgencyUrgent: "#C0392B",

  // Kinds of spending (lib/expenses/category-look.ts). One hue per group, used
  // the same way in the add grid, the list, the month split and Profit's bars:
  // `ink` for the mark and bars, `tint` for the tile behind it, `onHero` for
  // the split bar on the dark hero card.
  expenseGroups: {
    ingredients: { ink: "#4E7A2E", tint: "#EAF1E1", onHero: "#8FBF6A" },
    staff: { ink: "#4A5A92", tint: "#E8EBF5", onHero: "#8E9BD0" },
    occupancy: { ink: "#8A4A7A", tint: "#F4E7F0", onHero: "#C894BB" },
    utilities: { ink: "#B86A0C", tint: "#FBEFDC", onHero: "#E4A64B" },
    operating: { ink: "#24726C", tint: "#E0F0EE", onHero: "#6FB8B1" },
    admin: { ink: "#5B6472", tint: "#EDEFF2", onHero: "#A5ADBA" },
    other: { ink: "#7A746A", tint: "#EFECE6", onHero: "#B8B2A7" },
    capex: { ink: "#1D1815", tint: "#E7E2DA", onHero: "#E8E1D6" },
    not_expense: { ink: "#6E685E", tint: "#F7F5F0", onHero: "#6E685E" },
  },

  // Deterministic avatar ring palette for customer initials
  avatarPalette: ["#E4572E", "#F59E0B", "#047857", "#5B6472", "#B23E1B", "#334155"],
} as const;

export const typography = {
  title: { fontSize: 24, fontWeight: "800" as const },
  heading: { fontSize: 17, fontWeight: "700" as const },
  body: { fontSize: 15, fontWeight: "400" as const },
  caption: { fontSize: 13, fontWeight: "400" as const },
  small: { fontSize: 11, fontWeight: "400" as const },
  eyebrow: {
    fontSize: 11,
    fontWeight: "700" as const,
    letterSpacing: 1,
    textTransform: "uppercase" as const,
  },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const radius = {
  sm: 8,
  md: 10,
  lg: 16,
  full: 9999,
} as const;

export const shadow = {
  sm: {
    shadowColor: "#1E160C",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
  },
  md: {
    shadowColor: "#1E160C",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 2,
  },
} as const;
