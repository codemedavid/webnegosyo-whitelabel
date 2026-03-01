export const colors = {
  background: "#F2F2F7",
  card: "#FFFFFF",
  primary: "#007AFF",
  primaryLight: "#E3F2FD",
  textPrimary: "#000000",
  textSecondary: "#8E8E93",
  textTertiary: "#C7C7CC",
  separator: "#E5E5EA",
  tabBar: "#FFFFFF",
  tabBarBorder: "#E5E5EA",
  success: "#34C759",
  successLight: "#E8F5E9",
  warning: "#FF9500",
  warningLight: "#FFF3E0",
  danger: "#FF3B30",
  dangerLight: "#FFEBEE",
  info: "#5AC8FA",
  infoLight: "#E1F5FE",
  statusPending: { bg: "#FFF3E0", text: "#E65100" },
  statusConfirmed: { bg: "#E1F5FE", text: "#01579B" },
  statusPreparing: { bg: "#FFF8E1", text: "#F57F17" },
  statusReady: { bg: "#E8F5E9", text: "#1B5E20" },
  statusDelivered: { bg: "#F3E5F5", text: "#4A148C" },
  statusCancelled: { bg: "#FFEBEE", text: "#B71C1C" },
} as const;

export const typography = {
  title: { fontSize: 22, fontWeight: "700" as const },
  heading: { fontSize: 17, fontWeight: "600" as const },
  body: { fontSize: 15, fontWeight: "400" as const },
  caption: { fontSize: 13, fontWeight: "400" as const },
  small: { fontSize: 11, fontWeight: "400" as const },
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
  md: 12,
  lg: 16,
  full: 9999,
} as const;

export const shadow = {
  sm: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  md: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
} as const;
