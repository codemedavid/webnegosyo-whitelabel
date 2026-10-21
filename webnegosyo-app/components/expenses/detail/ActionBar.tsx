import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { DetailActions } from "../../../lib/expenses/expense-detail";
import { colors, spacing, typography } from "../../../theme/colors";
import { Button } from "../../Button";

interface ActionBarProps {
  actions: DetailActions;
  onAddReceipt: () => void;
  onChange: () => void;
  onVoid: () => void;
}

/**
 * The sticky bar at the foot of the detail: Add receipt (the usual thing to
 * do), Change, and Void as red text — present only when the rules allow it.
 */
export function ActionBar({ actions, onAddReceipt, onChange, onVoid }: ActionBarProps) {
  const insets = useSafeAreaInsets();
  if (!actions.canAddReceipt && !actions.canChange && !actions.canVoid) return null;
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
      {actions.canAddReceipt ? (
        <Button label="Add receipt" icon="camera" onPress={onAddReceipt} style={styles.grow} fullWidth={false} testID="detail-add-receipt" />
      ) : null}
      {actions.canChange ? (
        <Button label="Change" tone="secondary" onPress={onChange} style={styles.grow} fullWidth={false} testID="detail-change" />
      ) : null}
      {actions.canVoid ? (
        // Button has no red-text tone; a filled red button would shout louder than the main action.
        <TouchableOpacity
          onPress={onVoid}
          style={styles.voidHit}
          accessibilityRole="button"
          accessibilityLabel="Void this expense"
          testID="detail-void"
        >
          <Text style={styles.voidText}>Void</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  grow: { flex: 1 },
  voidHit: { minHeight: 44, minWidth: 64, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.md },
  voidText: { ...typography.body, fontWeight: "700", color: colors.danger },
});
