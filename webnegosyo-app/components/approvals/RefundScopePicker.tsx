import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import {
  withAmountText,
  withQuantity,
  withScope,
  type RequestDraft,
  type RequestOrder,
  type RequestOrderItem,
} from "../../lib/approvals/request-draft";
import { formatPesoShort } from "../../lib/approvals/state";
import type { RefundScope } from "../../lib/approvals/types";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { CashInput } from "../drawer/DrawerSheet";
import { Icon } from "../Icon";
import { SegmentedControl } from "../SegmentedControl";

const SCOPES: readonly { label: string; value: RefundScope }[] = [
  { label: "Items", value: "items" },
  { label: "Amount", value: "amount" },
  { label: "Whole order", value: "whole" },
];

interface RefundScopePickerProps {
  draft: RequestDraft;
  order: RequestOrder;
  onChange: (draft: RequestDraft) => void;
}

function Stepper({ item, quantity, onSet }: { item: RequestOrderItem; quantity: number; onSet: (quantity: number) => void }) {
  const each = item.quantity > 0 ? item.lineTotal / item.quantity : 0;
  return (
    <View style={styles.itemRow}>
      <View style={styles.itemCopy}>
        <Text style={styles.itemName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.itemMeta}>{`${formatPesoShort(each)} each · ${item.quantity} on the order`}</Text>
      </View>
      <TouchableOpacity
        style={[styles.stepButton, quantity === 0 && styles.stepDisabled]}
        onPress={() => onSet(quantity - 1)}
        disabled={quantity === 0}
        accessibilityRole="button"
        accessibilityLabel={`Remove one ${item.name}`}
      >
        <Icon name="minus" size={18} color={colors.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.qty} accessibilityLabel={`${quantity} ${item.name} to refund`}>
        {quantity}
      </Text>
      <TouchableOpacity
        style={[styles.stepButton, quantity >= item.quantity && styles.stepDisabled]}
        onPress={() => onSet(quantity + 1)}
        disabled={quantity >= item.quantity}
        accessibilityRole="button"
        accessibilityLabel={`Add one ${item.name}`}
      >
        <Icon name="plus" size={18} color={colors.textPrimary} />
      </TouchableOpacity>
    </View>
  );
}

/** Refund scope (design-spec §3.8.2): item steppers, a peso amount capped at refundable, or the whole order. */
export function RefundScopePicker({ draft, order, onChange }: RefundScopePickerProps) {
  return (
    <View style={styles.wrap}>
      <SegmentedControl options={SCOPES} value={draft.scope} onChange={(scope) => onChange(withScope(draft, scope))} accessibilityPrefix="Refund" />
      {draft.scope === "items" ? (
        <View style={styles.items}>
          {order.items.map((item) => (
            <Stepper
              key={item.id}
              item={item}
              quantity={draft.quantities[item.id] ?? 0}
              onSet={(quantity) => onChange(withQuantity(draft, item, quantity))}
            />
          ))}
        </View>
      ) : null}
      {draft.scope === "amount" ? (
        <View style={styles.amount}>
          <CashInput
            value={draft.amountText}
            onChangeText={(text) => onChange(withAmountText(draft, text))}
            accessibilityLabel="Amount to give back"
          />
          <Text style={styles.cap}>{`Up to ${formatPesoShort(order.refundable)} can be refunded`}</Text>
        </View>
      ) : null}
      {draft.scope === "whole" ? (
        <Text style={styles.whole}>{`Gives back ${formatPesoShort(order.refundable)} and cancels the order.`}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  items: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.separator, overflow: "hidden" },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    minHeight: 60,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  itemCopy: { flex: 1, gap: 2 },
  itemName: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  itemMeta: { ...typography.caption, color: colors.textMuted },
  stepButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: radius.full },
  stepDisabled: { opacity: 0.35 },
  qty: { ...typography.heading, minWidth: 24, textAlign: "center", color: colors.textPrimary },
  amount: { gap: spacing.xs },
  cap: { ...typography.caption, color: colors.textMuted },
  whole: { ...typography.body, color: colors.textPrimary },
});
