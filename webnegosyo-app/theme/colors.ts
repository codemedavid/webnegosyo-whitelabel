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
