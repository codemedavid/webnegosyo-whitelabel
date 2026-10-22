import { StyleSheet } from "react-native";

import { colors, radius, shadow, spacing, typography } from "../../theme/colors";

/** The Profit screen's card language: white, radius 16, a soft shadow, no border (design brief). */
export const profitCard = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadow.sm,
  },
  title: { ...typography.heading, color: colors.textPrimary },
  hint: { ...typography.caption, color: colors.textMuted },
  tabular: { fontVariant: ["tabular-nums"] },
});
