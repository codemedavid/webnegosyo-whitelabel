import React, { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, spacing, typography } from "../../theme/colors";
import { Icon } from "../Icon";

export const ACTIVITY_DAY_HEADER_HEIGHT = 44;

interface ActivityDayHeaderProps {
  label: string;
  summary: string;
  isAllClear: boolean;
}

/** "Today · ₱185 refunded · 1 cancel" — every day opens with its verdict (spec P1). */
function ActivityDayHeaderBase({ label, summary, isAllClear }: ActivityDayHeaderProps) {
  return (
    <View style={styles.header} accessibilityRole="header" accessible accessibilityLabel={`${label}. ${summary}.`}>
      <Text style={styles.day} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.summaryRow}>
        {isAllClear ? <Icon name="check" size={13} color={colors.success} strokeWidth={2.25} /> : null}
        <Text style={styles.summary} numberOfLines={1}>
          {summary}
        </Text>
      </View>
    </View>
  );
}

export const ActivityDayHeader = memo(ActivityDayHeaderBase);

const styles = StyleSheet.create({
  header: {
    minHeight: ACTIVITY_DAY_HEADER_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
  },
  day: { ...typography.body, fontWeight: "800", color: colors.textPrimary },
  summaryRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 4, minWidth: 0 },
  summary: { ...typography.caption, color: colors.textMuted, flexShrink: 1 },
});
