/**
 * Whether this order is paid, said once, at the top of the order screen.
 *
 * It used to be a "Status: pending" caption at the foot of the Payment card,
 * which a cashier deciding whether to hand food over had to scroll to and then
 * translate. Now it is the first thing under the order's progress, in words,
 * with the action that settles it beside it.
 */

import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { formatPeso } from "../../lib/format";
import { Icon } from "../Icon";

interface PaymentStatusStripProps {
  isUnpaid: boolean;
  balanceDue: number;
  /** Rung up at the register as "pay later". */
  isPayLater: boolean;
  /** `undefined` when collecting is not open to this person here. */
  onCollect?: () => void;
}

export function PaymentStatusStrip({
  isUnpaid,
  balanceDue,
  isPayLater,
  onCollect,
}: PaymentStatusStripProps) {
  if (!isUnpaid) {
    return (
      <View style={[styles.strip, styles.paid]} accessibilityLabel="Payment status: paid">
        <View style={[styles.badge, styles.badgePaid]}>
          <Icon name="check" size={16} color={colors.textOnDark} strokeWidth={2.25} />
        </View>
        <Text style={styles.title}>Paid</Text>
      </View>
    );
  }

  return (
    <View style={[styles.strip, styles.unpaid]} accessibilityLabel="Payment status: unpaid">
      <View style={[styles.badge, styles.badgeUnpaid]}>
        <Icon name="clock" size={16} color={colors.textOnDark} strokeWidth={2.25} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>Unpaid · {formatPeso(balanceDue)} due</Text>
        <Text style={styles.detail}>
          {isPayLater
            ? "Rung up as “pay later”. Collect when the customer pays."
            : "Not paid yet. Collect when the customer pays."}
        </Text>
      </View>
      {onCollect && (
        <TouchableOpacity style={styles.collect} onPress={onCollect} accessibilityRole="button">
          <Text style={styles.collectText}>Collect</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  paid: { backgroundColor: colors.successLight, borderColor: colors.success },
  unpaid: { backgroundColor: colors.warningLight, borderColor: colors.warning },
  badge: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  badgePaid: { backgroundColor: colors.success },
  badgeUnpaid: { backgroundColor: colors.warning },
  body: { flex: 1, gap: 2 },
  title: { ...typography.body, fontWeight: "800", color: colors.textPrimary },
  detail: { ...typography.caption, color: colors.textSecondary },
  collect: {
    backgroundColor: colors.textPrimary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  collectText: { ...typography.body, fontWeight: "700", color: colors.textOnDark },
});
