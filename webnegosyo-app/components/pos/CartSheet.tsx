import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radius, shadow, spacing, typography } from "../../theme/colors";
import { formatPeso } from "../../lib/format";
import type { CartTotals, PosCartLine } from "../../lib/pos-cart";
import type { PosOrderType } from "../../lib/pos-catalog";

interface CartSheetProps {
  lines: PosCartLine[];
  totals: CartTotals;
  orderTypes: PosOrderType[];
  orderTypeId: string | null;
  isExpanded: boolean;
  onToggle: () => void;
  onSelectOrderType: (type: PosOrderType) => void;
  onChangeQty: (key: string, quantity: number) => void;
  onClear: () => void;
  onCharge: () => void;
}

/**
 * The running sale, docked to the bottom of the register.
 *
 * Collapsed by default so the product grid keeps the screen: the summary row
 * and the Charge total are always readable, and the line detail expands only
 * when the cashier needs to correct something. Charge stays in the same
 * position in both states so muscle memory holds.
 */
export function CartSheet({
  lines,
  totals,
  orderTypes,
  orderTypeId,
  isExpanded,
  onToggle,
  onSelectOrderType,
  onChangeQty,
  onClear,
  onCharge,
}: CartSheetProps) {
  const hasItems = lines.length > 0;
  const activeType = orderTypes.find((type) => type.id === orderTypeId);

  return (
    <View style={styles.sheet}>
      {hasItems ? (
        <TouchableOpacity
          style={styles.handle}
          onPress={onToggle}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={isExpanded ? "Hide sale items" : "Show sale items"}
        >
          <View style={styles.handleLeft}>
            <Text style={styles.chevron}>{isExpanded ? "⌄" : "⌃"}</Text>
            <Text style={styles.handleText}>
              {totals.itemCount} {totals.itemCount === 1 ? "item" : "items"}
            </Text>
            {!isExpanded && (
              <Text style={styles.handleHint} numberOfLines={1}>
                · {lines.map((line) => line.name).join(", ")}
              </Text>
            )}
          </View>
          <TouchableOpacity onPress={onClear} hitSlop={10}>
            <Text style={styles.clear}>Clear</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      ) : null}

      {hasItems && isExpanded ? (
        <>
          <ScrollView style={styles.lines} contentContainerStyle={styles.linesContent}>
            {lines.map((line) => (
              <View key={line.key} style={styles.line}>
                <View style={styles.lineText}>
                  <Text style={styles.lineName} numberOfLines={1}>
                    {line.name}
                  </Text>
                  {line.selections.length > 0 && (
                    <Text style={styles.lineMeta} numberOfLines={1}>
                      {line.selections.map((s) => s.optionName).join(", ")}
                    </Text>
                  )}
                  {line.note ? (
                    <Text style={styles.lineMeta} numberOfLines={1}>
                      Note: {line.note}
                    </Text>
                  ) : null}
                </View>

                <View style={styles.stepper}>
                  <TouchableOpacity
                    style={styles.step}
                    onPress={() => onChangeQty(line.key, line.quantity - 1)}
                    accessibilityLabel={`Decrease ${line.name}`}
                  >
                    <Text style={styles.stepText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.quantity}>{line.quantity}</Text>
                  <TouchableOpacity
                    style={styles.step}
                    onPress={() => onChangeQty(line.key, line.quantity + 1)}
                    accessibilityLabel={`Increase ${line.name}`}
                  >
                    <Text style={styles.stepText}>+</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.lineTotal}>{formatPeso(line.subtotal)}</Text>
              </View>
            ))}
          </ScrollView>

          <View style={styles.totals}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>{formatPeso(totals.subtotal)}</Text>
            </View>
            {totals.serviceCharge > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Service charge</Text>
                <Text style={styles.totalValue}>{formatPeso(totals.serviceCharge)}</Text>
              </View>
            )}
          </View>
        </>
      ) : null}

      {orderTypes.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.typeRow}
        >
          {orderTypes.map((type) => {
            const isActive = orderTypeId === type.id;
            return (
              <TouchableOpacity
                key={type.id}
                style={[styles.typeChip, isActive && styles.typeChipActive]}
                onPress={() => onSelectOrderType(type)}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
              >
                <Text style={[styles.typeText, isActive && styles.typeTextActive]}>
                  {type.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <TouchableOpacity
        style={[styles.charge, !hasItems && styles.chargeDisabled]}
        disabled={!hasItems}
        onPress={onCharge}
        activeOpacity={0.85}
        accessibilityRole="button"
      >
        {hasItems ? (
          <>
            <View>
              <Text style={styles.chargeLabel}>Charge</Text>
              {activeType ? <Text style={styles.chargeMeta}>{activeType.name}</Text> : null}
            </View>
            <Text style={styles.chargeTotal}>{formatPeso(totals.total)}</Text>
          </>
        ) : (
          <Text style={styles.chargeEmpty}>Tap a product to start the sale</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.separator,
    ...shadow.md,
  },
  handle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: spacing.md,
  },
  handleLeft: { flexDirection: "row", alignItems: "center", flex: 1, gap: spacing.sm },
  chevron: { fontSize: 14, color: colors.textTertiary, width: 12 },
  handleText: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
  handleHint: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  clear: { ...typography.caption, color: colors.danger, fontWeight: "700" },
  lines: { maxHeight: 240 },
  linesContent: { gap: spacing.sm, paddingBottom: spacing.sm },
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  lineText: { flex: 1 },
  lineName: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  lineMeta: { ...typography.small, color: colors.textSecondary },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  step: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: { fontSize: 17, lineHeight: 20, color: colors.textPrimary },
  quantity: {
    ...typography.body,
    fontWeight: "800",
    minWidth: 24,
    textAlign: "center",
    color: colors.textPrimary,
  },
  lineTotal: {
    ...typography.caption,
    fontWeight: "700",
    minWidth: 68,
    textAlign: "right",
    color: colors.textPrimary,
  },
  totals: {
    borderTopWidth: 1,
    borderTopColor: colors.separator,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    gap: 2,
  },
  totalRow: { flexDirection: "row", justifyContent: "space-between" },
  totalLabel: { ...typography.caption, color: colors.textSecondary },
  totalValue: { ...typography.caption, fontWeight: "600", color: colors.textPrimary },
  typeRow: { gap: spacing.sm, paddingVertical: spacing.sm },
  typeChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 7,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.card,
  },
  typeChipActive: { backgroundColor: colors.accentLight, borderColor: colors.accent },
  typeText: { ...typography.caption, color: colors.textSecondary },
  typeTextActive: { color: colors.accent, fontWeight: "700" },
  charge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    marginTop: spacing.xs,
  },
  chargeDisabled: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.separator,
    justifyContent: "center",
  },
  chargeLabel: { ...typography.heading, color: colors.textOnDark },
  chargeMeta: { ...typography.small, color: "rgba(255,255,255,0.65)", marginTop: 1 },
  chargeTotal: { ...typography.title, color: colors.textOnDark },
  chargeEmpty: { ...typography.caption, color: colors.textSecondary, fontWeight: "600" },
});
