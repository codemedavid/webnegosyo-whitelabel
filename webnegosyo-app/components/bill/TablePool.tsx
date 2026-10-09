import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { formatPeso } from "../../lib/format";
import { Icon } from "../Icon";
import { fromCents } from "../../lib/bill/money";
import { groupUnits } from "../../lib/bill/bill-parts";
import type { BillUnit } from "../../lib/bill/bill-split";

interface TablePoolProps {
  units: readonly BillUnit[];
  /** "Guest 2": where a tap sends a dish. */
  activeLabel: string;
  onGive: (unitId: string) => void;
  disabled?: boolean;
}

/** What nobody has claimed yet. One tap gives one piece to the highlighted guest. */
export function TablePool({ units, activeLabel, onGive, disabled = false }: TablePoolProps) {
  const groups = groupUnits(units);
  if (groups.length === 0) {
    return (
      <View style={[styles.card, styles.done]}>
        <Icon name="check" size={18} color={colors.success} />
        <Text style={styles.doneText}>Every dish has a guest</Text>
      </View>
    );
  }
  return (
    <View style={styles.card}>
      <Text style={styles.hint}>
        Tap a dish to give it to <Text style={styles.hintStrong}>{activeLabel}</Text>
      </Text>
      {groups.map((group) => (
        <TouchableOpacity
          key={group.key}
          style={styles.row}
          onPress={() => onGive(group.unitIds[0])}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`Give one ${group.name} to ${activeLabel}`}
        >
          <View style={styles.count}>
            <Text style={styles.countText}>{group.count}×</Text>
          </View>
          <View style={styles.copy}>
            <Text style={styles.name} numberOfLines={1}>
              {group.name}
            </Text>
            {group.detail ? (
              <Text style={styles.detail} numberOfLines={1}>
                {group.detail}
              </Text>
            ) : null}
          </View>
          <Text style={styles.price}>{formatPeso(fromCents(group.unitCents))}</Text>
          <Icon name="chevron" size={16} color={colors.textTertiary} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  done: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.lg, justifyContent: "center" },
  doneText: { ...typography.body, fontWeight: "700", color: colors.success },
  hint: { ...typography.caption, color: colors.textSecondary, paddingVertical: spacing.sm },
  hintStrong: { color: colors.accent, fontWeight: "800" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  count: { minWidth: 34, paddingVertical: 2, borderRadius: radius.sm, backgroundColor: colors.accentLight, alignItems: "center" },
  countText: { ...typography.caption, fontWeight: "800", color: colors.accent },
  copy: { flex: 1, gap: 2 },
  name: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  detail: { ...typography.caption, color: colors.textSecondary },
  price: { ...typography.body, color: colors.textSecondary, fontVariant: ["tabular-nums"] },
});
