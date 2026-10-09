import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Icon } from "../Icon";
import { CheckoutFieldInput } from "./CheckoutFieldInput";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { formatPeso } from "../../lib/format";
import { answeredCount, type CheckoutAnswers } from "../../lib/pos-checkout-answers";
import type { PosCheckoutField } from "../../lib/pos-checkout-fields";
import type { PosDeliveryDetails } from "../../lib/pos-delivery";

interface CheckoutDetailsProps {
  /** Show the delivery row (the sale's order type is a delivery type). */
  isDelivery: boolean;
  delivery: PosDeliveryDetails;
  /** The fee actually charged (0 = none). */
  deliveryFee: number;
  onOpenDelivery: () => void;
  /** The merchant's own questions for this order type ("Landmark", …). */
  customFields: readonly PosCheckoutField[];
  answers: CheckoutAnswers;
  onAnswer: (fieldName: string, value: string) => void;
}

/**
 * The storefront's checkout questions on the tender screen, kept quiet:
 * delivery is one summary row that opens the delivery sheet, and the
 * merchant's extra questions wait behind a "More details" row until the
 * cashier wants them. Nothing here is required.
 */
export function CheckoutDetails({
  isDelivery,
  delivery,
  deliveryFee,
  onOpenDelivery,
  customFields,
  answers,
  onAnswer,
}: CheckoutDetailsProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  if (!isDelivery && customFields.length === 0) return null;

  const filled = answeredCount(customFields, answers);
  const hasAddress = delivery.address.trim() !== "";
  const meta = [
    deliveryFee > 0 ? `Fee ${formatPeso(deliveryFee)}` : "No delivery fee",
    delivery.phone.trim() || null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={styles.card}>
      {isDelivery && (
        <TouchableOpacity
          style={styles.row}
          onPress={onOpenDelivery}
          accessibilityRole="button"
          accessibilityLabel={hasAddress ? `Delivery to ${delivery.address}. Edit` : "Add delivery address and fee"}
        >
          <View style={[styles.iconWell, hasAddress && styles.iconWellActive]}>
            <Icon name="pin" size={18} color={hasAddress ? colors.accent : colors.textSecondary} strokeWidth={2} />
          </View>
          <View style={styles.rowText}>
            <Text style={[styles.rowTitle, !hasAddress && styles.rowTitleMuted]} numberOfLines={2}>
              {hasAddress ? delivery.address : "Add delivery address"}
            </Text>
            <Text style={styles.rowMeta} numberOfLines={1}>
              {meta}
            </Text>
          </View>
          <Icon name="chevron" size={16} color={colors.textTertiary} />
        </TouchableOpacity>
      )}

      {customFields.length > 0 && (
        <>
          <TouchableOpacity
            style={[styles.row, isDelivery && styles.rowDivider]}
            onPress={() => setIsExpanded((open) => !open)}
            accessibilityRole="button"
            accessibilityState={{ expanded: isExpanded }}
          >
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>More details</Text>
              <Text style={styles.rowMeta}>
                {filled > 0
                  ? `${filled} of ${customFields.length} answered`
                  : customFields.map((field) => field.label).join(", ")}
              </Text>
            </View>
            <View style={isExpanded ? styles.chevronOpen : undefined}>
              <Icon name="chevron-down" size={16} color={colors.textTertiary} />
            </View>
          </TouchableOpacity>
          {isExpanded && (
            <View style={styles.fields}>
              {customFields.map((field) => (
                <CheckoutFieldInput
                  key={field.id}
                  field={field}
                  value={answers[field.name] ?? ""}
                  onChange={(next) => onAnswer(field.name, next)}
                />
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 56,
  },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
  iconWell: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWellActive: { backgroundColor: colors.accentLight },
  rowText: { flex: 1 },
  rowTitle: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  rowTitleMuted: { color: colors.textSecondary },
  rowMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  chevronOpen: { transform: [{ rotate: "180deg" }] },
  fields: {
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
});
