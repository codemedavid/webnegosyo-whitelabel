import { StyleSheet } from "react-native";

import { colors, radius, shadow, spacing, typography } from "../../theme/colors";

/** The card furniture every Shift sales section shares (white card, warm border, 17/700 title). */
export const card = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.separator,
    padding: spacing.lg,
    gap: spacing.md,
  },
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: spacing.sm },
  title: { ...typography.heading, color: colors.textPrimary },
  hint: { ...typography.caption, color: colors.textMuted },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 48 },
  label: { ...typography.body, fontWeight: "600", color: colors.textPrimary, flex: 1 },
  meta: { ...typography.caption, color: colors.textMuted },
  money: { ...typography.body, fontWeight: "700", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator },
});

/** The ink hero (the one money number on the screen). */
export const ink = StyleSheet.create({
  hero: { backgroundColor: colors.heroInk, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.sm, ...shadow.md },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.heroInkElevated,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  chipText: { ...typography.caption, fontWeight: "800", color: colors.heroInkText },
  eyebrow: { ...typography.eyebrow, color: colors.heroInkMuted, marginTop: spacing.sm },
  muted: { ...typography.caption, color: colors.heroInkMuted },
  text: { ...typography.caption, color: colors.heroInkText },
  pending: { ...typography.heading, color: colors.heroInkMuted, marginVertical: spacing.sm },
  lines: { gap: 6, borderTopWidth: 1, borderTopColor: colors.heroInkElevated, paddingTop: spacing.md, marginTop: spacing.xs },
  line: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  lineValue: { ...typography.caption, fontWeight: "700", color: colors.heroInkText, fontVariant: ["tabular-nums"] },
  attention: { color: colors.heroInkNegative },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  action: { flex: 1 },
  coral: { backgroundColor: colors.accent },
});
