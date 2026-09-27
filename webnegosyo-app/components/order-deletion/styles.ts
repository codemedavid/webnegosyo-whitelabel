import { StyleSheet } from "react-native";
import { colors, radius, shadow, spacing, typography } from "../../theme/colors";

/** Shared look for the delete-orders screen's panels and inputs. */
export const deletionStyles = StyleSheet.create({
  panel: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.md,
    ...shadow.sm,
  },
  dangerPanel: { borderWidth: 1, borderColor: colors.dangerLight },
  heading: { ...typography.heading, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textPrimary },
  caption: { ...typography.caption, color: colors.textSecondary, lineHeight: 19 },
  error: {
    ...typography.caption,
    color: colors.danger,
    backgroundColor: colors.dangerLight,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceSubtle,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.textSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: colors.danger, borderColor: colors.danger },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.lg },
  stat: { minWidth: "40%" },
  statValue: { ...typography.heading, color: colors.textPrimary },
});
