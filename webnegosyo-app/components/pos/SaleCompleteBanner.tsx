/**
 * The register's confirmation of the sale it just finished.
 *
 * The register comes back empty the instant a sale is swiped through, ready
 * for the next customer. This card is what is left of the tender screen: the
 * change to hand over, or — for a "pay later" order — that it is unpaid and
 * where to collect it. It times out on its own; nothing waits on it.
 */

import React, { useEffect } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Icon } from "../Icon";
import { usePosLastSaleStore } from "../../stores/pos-last-sale-store";

/** Long enough to count out change; short enough not to be furniture. */
export const SALE_NOTICE_MS = 10_000;

interface SaleCompleteBannerProps {
  onOpenOrder: (orderId: string) => void;
  /**
   * The sale is still on its way to the server (written behind). Its order
   * screen would read "not found" for that second, so the link waits.
   */
  isSaving?: (orderId: string) => boolean;
}

export function SaleCompleteBanner({ onOpenOrder, isSaving }: SaleCompleteBannerProps) {
  const lastSale = usePosLastSaleStore((s) => s.lastSale);
  const dismiss = usePosLastSaleStore((s) => s.dismiss);

  useEffect(() => {
    if (!lastSale) return;
    const timer = setTimeout(dismiss, SALE_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [lastSale, dismiss]);

  if (!lastSale) return null;

  const { notice } = lastSale;
  const isUnpaid = notice.tone === "unpaid";

  return (
    <View
      testID="sale-complete-banner"
      style={[styles.card, isUnpaid ? styles.cardUnpaid : styles.cardPaid]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <View style={[styles.badge, isUnpaid ? styles.badgeUnpaid : styles.badgePaid]}>
        <Icon name={isUnpaid ? "clock" : "check"} size={18} color={colors.textOnDark} strokeWidth={2.25} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {notice.title}
        </Text>
        <Text style={styles.detail} numberOfLines={2}>
          {notice.detail}
        </Text>
      </View>
      {lastSale.canOpenOrder && isSaving?.(lastSale.orderId) ? (
        <Text style={styles.saving}>Saving…</Text>
      ) : lastSale.canOpenOrder && (
        <TouchableOpacity
          style={styles.link}
          onPress={() => {
            dismiss();
            onOpenOrder(lastSale.orderId);
          }}
          accessibilityRole="button"
        >
          <Text style={styles.linkText}>View order</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        onPress={dismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Icon name="close" size={18} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1,
    marginTop: spacing.sm,
  },
  cardPaid: { backgroundColor: colors.successLight, borderColor: colors.success },
  cardUnpaid: { backgroundColor: colors.warningLight, borderColor: colors.warning },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  badgePaid: { backgroundColor: colors.success },
  badgeUnpaid: { backgroundColor: colors.warning },
  body: { flex: 1, gap: 2 },
  title: { ...typography.body, fontWeight: "800", color: colors.textPrimary },
  detail: { ...typography.caption, color: colors.textSecondary },
  link: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  linkText: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
  saving: { ...typography.caption, color: colors.textSecondary },
});
