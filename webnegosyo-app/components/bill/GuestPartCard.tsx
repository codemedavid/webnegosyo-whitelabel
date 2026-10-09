import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { formatPeso } from "../../lib/format";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { fromCents } from "../../lib/bill/money";
import { groupUnits, type BillPartView } from "../../lib/bill/bill-parts";

interface GuestPartCardProps {
  part: BillPartView;
  /** By item: this guest is the one tapped dishes go to. */
  isActive?: boolean;
  onActivate?: () => void;
  /** By item: put one piece back on the table. */
  onReturn?: (unitId: string) => void;
  printLabel?: string;
  onPrint?: () => void;
  onCollect?: () => void;
  collectDisabledReason?: string;
}

/** One guest's share: who, how much, and the two things to do with it. */
export function GuestPartCard({
  part,
  isActive = false,
  onActivate,
  onReturn,
  printLabel = "Print",
  onPrint,
  onCollect,
  collectDisabledReason,
}: GuestPartCardProps) {
  const groups = groupUnits(part.units);
  const isEmpty = part.amountCents === 0;
  const status = part.isPaid
    ? "Paid"
    : part.paidCents > 0
      ? `${formatPeso(fromCents(part.remainingCents))} left`
      : null;

  return (
    <View style={[styles.card, isActive && styles.cardActive, part.isPaid && styles.cardPaid]}>
      <TouchableOpacity
        style={styles.header}
        onPress={onActivate}
        disabled={!onActivate}
        accessibilityRole={onActivate ? "button" : undefined}
        accessibilityLabel={onActivate ? `Give dishes to ${part.label}` : undefined}
        accessibilityState={{ selected: isActive }}
      >
        <View style={[styles.avatar, isActive && styles.avatarActive]}>
          <Text style={[styles.avatarText, isActive && styles.avatarTextActive]}>{part.guest + 1}</Text>
        </View>
        <View style={styles.copy}>
          <Text style={styles.label}>{part.label}</Text>
          {status ? (
            <View style={styles.statusRow}>
              {part.isPaid ? <Icon name="check" size={14} color={colors.success} /> : null}
              <Text style={[styles.status, part.isPaid && styles.statusPaid]}>{status}</Text>
            </View>
          ) : isActive ? (
            <Text style={styles.activeHint}>Tap dishes above to add them</Text>
          ) : null}
        </View>
        <Text style={[styles.amount, isEmpty && styles.amountEmpty]}>{formatPeso(fromCents(part.amountCents))}</Text>
      </TouchableOpacity>

      {groups.length > 0 ? (
        <View style={styles.items}>
          {groups.map((group) => (
            <TouchableOpacity
              key={group.key}
              style={styles.item}
              onPress={() => onReturn?.(group.unitIds[group.unitIds.length - 1])}
              disabled={!onReturn}
              accessibilityRole="button"
              accessibilityLabel={`Put one ${group.name} back on the table`}
            >
              <Text style={styles.itemText} numberOfLines={1}>
                {group.count > 1 ? `${group.count}× ` : ""}
                {group.name}
              </Text>
              {onReturn ? <Icon name="close" size={12} color={colors.textSecondary} /> : null}
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {!isEmpty && (onPrint || (onCollect && !part.isPaid)) ? (
        <View style={styles.actions}>
          {onPrint ? (
            <Button label={printLabel} icon="printer" tone="secondary" size="sm" onPress={onPrint} style={styles.action} />
          ) : null}
          {onCollect && !part.isPaid ? (
            <Button
              label={`Collect ${formatPeso(fromCents(part.remainingCents))}`}
              size="sm"
              onPress={onCollect}
              disabled={Boolean(collectDisabledReason)}
              accessibilityHint={collectDisabledReason}
              style={styles.action}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 2,
    borderColor: "transparent",
  },
  cardActive: { borderColor: colors.accent },
  cardPaid: { backgroundColor: colors.successLight },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarActive: { backgroundColor: colors.accent },
  avatarText: { ...typography.body, fontWeight: "800", color: colors.textPrimary },
  avatarTextActive: { color: colors.textOnDark },
  copy: { flex: 1, gap: 2 },
  label: { ...typography.heading, color: colors.textPrimary },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  status: { ...typography.caption, fontWeight: "700", color: colors.danger },
  statusPaid: { color: colors.success },
  activeHint: { ...typography.caption, color: colors.accent, fontWeight: "600" },
  amount: { fontSize: 20, fontWeight: "800", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  amountEmpty: { color: colors.textTertiary },
  items: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    maxWidth: "100%",
  },
  itemText: { ...typography.caption, fontWeight: "600", color: colors.textPrimary, flexShrink: 1 },
  actions: { flexDirection: "row", gap: spacing.sm },
  action: { flex: 1 },
});
