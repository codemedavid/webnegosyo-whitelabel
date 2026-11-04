import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import type { HomeView } from "../../../lib/expenses/expenses-home";
import { colors, radius, spacing, typography } from "../../../theme/colors";
import { Icon, type IconName } from "../../Icon";

interface PillProps {
  label: string;
  isOn: boolean;
  onPress: () => void;
  count?: number;
  trailingIcon?: IconName;
  accessibilityLabel?: string;
}

/** Drawn 40 tall so the row stays light; the slop takes the target to 44pt. */
const PILL_MIN_HEIGHT = 40;
const PILL_SLOP = { top: 2, bottom: 2, left: 0, right: 0 };

function Pill({ label, isOn, onPress, count, trailingIcon, accessibilityLabel }: PillProps) {
  const fg = isOn ? colors.textOnDark : colors.textPrimary;
  return (
    <TouchableOpacity
      style={[styles.pill, isOn && styles.pillOn]}
      onPress={onPress}
      hitSlop={PILL_SLOP}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityState={{ selected: isOn }}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <Text style={[styles.label, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
      {count !== undefined && count > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count}</Text>
        </View>
      ) : null}
      {trailingIcon ? <Icon name={trailingIcon} size={14} color={fg} /> : null}
    </TouchableOpacity>
  );
}

const VIEW_PILLS: readonly { view: HomeView; label: string }[] = [
  { view: "all", label: "All" },
  { view: "drawer", label: "Drawer" },
  { view: "no_receipt", label: "No receipt" },
  { view: "check", label: "Check these" },
];

interface HomeFilterPillsProps {
  view: HomeView;
  checkCount: number;
  /** The chosen category's short name; null = every category. */
  categoryLabel: string | null;
  onView: (view: HomeView) => void;
  onCategory: () => void;
  /** The list's side padding; the row bleeds through it so pills scroll to the screen edge instead of being cut at the gutter. */
  gutterLeft?: number;
  gutterRight?: number;
}

/** All · Drawer · No receipt · Check these (count) · Category. Ink when on. */
export function HomeFilterPills({
  view,
  checkCount,
  categoryLabel,
  onView,
  onCategory,
  gutterLeft = 0,
  gutterRight = 0,
}: HomeFilterPillsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginLeft: -gutterLeft, marginRight: -gutterRight }}
      contentContainerStyle={[styles.row, { paddingLeft: gutterLeft, paddingRight: gutterRight }]}
    >
      {VIEW_PILLS.map((pill) => (
        <Pill
          key={pill.view}
          label={pill.label}
          isOn={view === pill.view}
          count={pill.view === "check" ? checkCount : undefined}
          onPress={() => onView(pill.view)}
          accessibilityLabel={pill.view === "check" && checkCount > 0 ? `${pill.label}, ${checkCount}` : pill.label}
        />
      ))}
      <Pill
        label={categoryLabel ?? "Category"}
        isOn={categoryLabel !== null}
        trailingIcon="chevron-down"
        onPress={onCategory}
        accessibilityLabel={categoryLabel ? `Category: ${categoryLabel}. Change` : "Pick a category"}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingVertical: 2 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: PILL_MIN_HEIGHT,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md + 2,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  pillOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  label: { ...typography.caption, fontWeight: "700" },
  badge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { ...typography.small, fontWeight: "800", color: colors.textOnDark, fontVariant: ["tabular-nums"] },
});
