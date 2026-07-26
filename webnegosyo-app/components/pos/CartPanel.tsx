import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { formatPeso } from "../../lib/format";
import type { CartTotals, PosCartLine } from "../../lib/pos-cart";

interface CartPanelProps {
  lines: PosCartLine[];
  totals: CartTotals;
  onChangeQty: (key: string, quantity: number) => void;
  onClear: () => void;
}

/** The running sale: every line, its options, and the live total. */
export function CartPanel({ lines, totals, onChangeQty, onClear }: CartPanelProps) {
  if (lines.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No items yet</Text>
        <Text style={styles.emptyBody}>Tap a product to start the sale.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Current Sale</Text>
        <TouchableOpacity onPress={onClear} hitSlop={8}>
          <Text style={styles.clear}>Clear</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.lines}>
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
                onPress={() => onChangeQty(line.key, line.quantity - 1)}
                hitSlop={8}
                accessibilityLabel={`Decrease ${line.name}`}
              >
                <Text style={styles.stepText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.quantity}>{line.quantity}</Text>
              <TouchableOpacity
                onPress={() => onChangeQty(line.key, line.quantity + 1)}
                hitSlop={8}
                accessibilityLabel={`Increase ${line.name}`}
              >
                <Text style={styles.stepText}>+</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.lineTotal}>{formatPeso(line.subtotal)}</Text>
          </View>
        ))}
      </ScrollView>

      {totals.serviceCharge > 0 && (
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Service charge</Text>
          <Text style={styles.totalLabel}>{formatPeso(totals.serviceCharge)}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  headerTitle: { ...typography.eyebrow, color: colors.textSecondary },
  clear: { ...typography.caption, color: colors.danger, fontWeight: "600" },
  lines: { paddingHorizontal: spacing.xl },
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  lineText: { flex: 1 },
  lineName: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  lineMeta: { ...typography.small, color: colors.textSecondary },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  stepText: { fontSize: 18, color: colors.textPrimary },
  quantity: { ...typography.body, fontWeight: "700", minWidth: 18, textAlign: "center" },
  lineTotal: { ...typography.body, fontWeight: "700", minWidth: 72, textAlign: "right" },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  totalLabel: { ...typography.caption, color: colors.textSecondary },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl },
  emptyTitle: { ...typography.heading, color: colors.textPrimary },
  emptyBody: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
});
