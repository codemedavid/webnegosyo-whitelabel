import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { deliveryExpensePrefill, type RecordedMovement } from "../../lib/expenses/money-glance";
import { useCanManageExpenses, useExpenseCategories } from "../../lib/expenses/use-expenses";
import { colors, radius, shadow, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { AddExpenseSheet } from "../expenses/AddExpenseSheet";

interface DeliveryExpensePromptProps {
  /** The movement just saved; the prompt shows only after a delivery. */
  movement: RecordedMovement | null;
  onDismiss: () => void;
}

const INGREDIENTS_KEY = "ingredients";

/**
 * After a delivery is added to stock: "Paid for this delivery? Record it"
 * (design brief, Connections → Stock). One tap opens the expense sheet on
 * Ingredients, marked as stock, with the typed cost × quantity filled in —
 * the owner can change any of it. Only for staff who may open Expenses.
 */
export function DeliveryExpensePrompt({ movement, onDismiss }: DeliveryExpensePromptProps) {
  const canRecord = useCanManageExpenses();
  const { categories } = useExpenseCategories();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  // Clear of the home indicator on phones that have one.
  const insets = useSafeAreaInsets();
  const bottom = Math.max(spacing.xl, insets.bottom + spacing.sm);
  const prefill = useMemo(() => (movement ? deliveryExpensePrefill(movement) : null), [movement]);
  const ingredientsId = categories.find((category) => category.systemKey === INGREDIENTS_KEY)?.id ?? null;

  if (!canRecord || !prefill || categories.length === 0) return null;

  const close = () => {
    setIsSheetOpen(false);
    onDismiss();
  };

  return (
    <>
      {isSheetOpen ? null : (
        <View style={[styles.card, { bottom }]} accessibilityLiveRegion="polite" testID="delivery-expense-prompt">
          <View style={styles.lead}>
            <View style={styles.well}>
              <Icon name="receipt" size={18} color={colors.accent} />
            </View>
            <View style={styles.copy}>
              <Text style={styles.title}>Paid for this delivery?</Text>
              <Text style={styles.detail} numberOfLines={2}>
                {prefill.note}
              </Text>
            </View>
          </View>
          {/* On a narrow phone the buttons wrap under the words instead of squeezing them. */}
          <View style={styles.actions}>
            <Button label="Not now" size="sm" tone="ghost" onPress={onDismiss} fullWidth={false} accessibilityLabel="Dismiss" />
            <Button label="Record it" size="sm" onPress={() => setIsSheetOpen(true)} fullWidth={false} />
          </View>
        </View>
      )}
      {isSheetOpen ? (
        <AddExpenseSheet
          visible
          mode={{ kind: "book" }}
          initialCategoryId={ingredientsId}
          initialAmountCents={prefill.amountCents}
          initialNote={prefill.note}
          initialIsStockPurchase
          onClose={close}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    // A snack over the shelf's foot, so it is seen without scrolling.
    position: "absolute",
    left: spacing.xl,
    right: spacing.xl,
    ...shadow.md,
  },
  // Words take the row; below ~200pt they keep it and the buttons go under.
  lead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexGrow: 1, flexShrink: 1, flexBasis: 200 },
  actions: { flexDirection: "row", gap: spacing.xs, marginLeft: "auto" },
  well: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.accentLight,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1, gap: 2 },
  title: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  detail: { ...typography.caption, color: colors.textSecondary },
});
