import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { describePeriodTimes, type ServicePeriod } from "../../lib/cash/service-periods";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { Icon } from "../Icon";
import type { BranchOption } from "./ServicePeriodSheet";

interface ShiftsSectionProps {
  /** null while loading. */
  periods: readonly ServicePeriod[] | null;
  error: string | null;
  branches: readonly BranchOption[];
  canEdit: boolean;
  onAdd: () => void;
  onEdit: (period: ServicePeriod) => void;
  onRetry: () => void;
}

/**
 * Named shifts (service periods). Optional: with none, each clocked-in shift is
 * its own report. With them, Reports and the day close split the day the way
 * the staff work it.
 */
export function ShiftsSection({ periods, error, branches, canEdit, onAdd, onEdit, onRetry }: ShiftsSectionProps) {
  const branchName = (id: string | null) =>
    id === null ? (branches.length > 1 ? "Every branch" : null) : branches.find((b) => b.id === id)?.name ?? "One branch";

  let body: React.ReactNode;
  if (error && periods === null) {
    body = (
      <View style={styles.inline}>
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
        <Button label="Try again" tone="secondary" size="sm" onPress={onRetry} />
      </View>
    );
  } else if (periods === null) {
    body = <Text style={styles.hint}>Loading shifts…</Text>;
  } else if (periods.length === 0) {
    body = (
      <Text style={styles.hint}>
        No named shifts. Each cashier&apos;s shift is its own report. Add Day and Night shifts to see sales split that way.
      </Text>
    );
  } else {
    body = (
      <View style={styles.list}>
        {periods.map((period, index) => {
          const where = branchName(period.outletId);
          const times = describePeriodTimes(period.startsMinutes, period.endsMinutes);
          return (
            <TouchableOpacity
              key={period.id}
              style={[styles.row, index > 0 && styles.divider]}
              onPress={() => onEdit(period)}
              disabled={!canEdit}
              accessibilityRole="button"
              accessibilityLabel={`${period.name}, ${times}${where ? `, ${where}` : ""}`}
              accessibilityHint={canEdit ? "Edit this shift" : undefined}
            >
              <View style={styles.icon}>
                <Icon name="clock" size={18} color={colors.textPrimary} />
              </View>
              <View style={styles.copy}>
                <Text style={styles.name}>{period.name}</Text>
                <Text style={styles.hint}>{where ? `${times} · ${where}` : times}</Text>
              </View>
              {canEdit ? <Icon name="chevron" size={16} color={colors.textTertiary} /> : null}
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.heading} accessibilityRole="header">
        Shifts
      </Text>
      {body}
      {canEdit && periods !== null ? <Button label="Add a shift" icon="plus" tone="secondary" onPress={onAdd} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  heading: { ...typography.heading, color: colors.textPrimary },
  hint: { ...typography.caption, color: colors.textMuted },
  error: { ...typography.caption, color: colors.danger, fontWeight: "600", flex: 1 },
  inline: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  list: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.separator, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, minHeight: 60 },
  divider: { borderTopWidth: 1, borderTopColor: colors.separator },
  icon: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1, gap: 2 },
  name: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
});
