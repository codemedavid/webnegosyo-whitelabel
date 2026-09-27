import React from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { colors, radius, shadow, spacing, typography } from "../../theme/colors";
import { formatAmount, formatShortDate } from "../../lib/voucher-admin/voucher-status";
import {
  REDEMPTION_READ_LIMIT,
  summarizeRedemptions,
  type VoucherRedemption,
} from "../../lib/voucher-admin/voucher-repository";
import type { VoucherChannel } from "../../lib/vouchers/types";

/**
 * Is this code earning its keep?
 *
 * Three numbers — how often it was used, what it cost, what it cost per order —
 * then the last few uses. Cost is the figure shown because it is exact: every
 * redemption records the discount it gave away.
 */

interface VoucherPerformanceCardProps {
  redemptions: readonly VoucherRedemption[] | undefined;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
}

const RECENT_USES_SHOWN = 5;

const CHANNEL_LABEL: Record<VoucherChannel, string> = {
  checkout: "Online",
  pos: "Counter",
  admin: "Admin",
};

export function VoucherPerformanceCard({
  redemptions,
  isLoading,
  error,
  onRetry,
}: VoucherPerformanceCardProps) {
  if (isLoading) {
    return (
      <View style={[styles.card, styles.center]}>
        <ActivityIndicator color={colors.textSecondary} />
      </View>
    );
  }

  if (error || !redemptions) {
    return (
      <View style={styles.card}>
        <Text style={styles.muted}>Couldn&apos;t load how this code has been used.</Text>
        <TouchableOpacity onPress={onRetry} accessibilityRole="button" style={styles.retry}>
          <Text style={styles.retryText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const summary = summarizeRedemptions(redemptions);
  if (summary.count === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.emptyTitle}>No uses yet</Text>
        <Text style={styles.muted}>
          Share the code with your customers — every order that uses it will show up here.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.stats}>
        <Stat label="Times used" value={String(summary.count)} />
        <View style={styles.divider} />
        <Stat label="Given away" value={formatAmount(summary.totalDiscounted)} />
        <View style={styles.divider} />
        <Stat label="Per order" value={formatAmount(summary.averageDiscount)} />
      </View>
      {summary.isTruncated ? (
        <Text style={styles.note}>Totals cover the latest {REDEMPTION_READ_LIMIT} uses.</Text>
      ) : null}

      <Text style={styles.recentTitle}>Recent uses</Text>
      {redemptions.slice(0, RECENT_USES_SHOWN).map((use) => (
        <View key={`${use.orderId}-${use.createdAt}`} style={styles.useRow}>
          <View style={styles.channel}>
            <Text style={styles.channelText}>{CHANNEL_LABEL[use.channel] ?? use.channel}</Text>
          </View>
          <Text style={styles.useDate}>{formatShortDate(Date.parse(use.createdAt))}</Text>
          <Text style={styles.useAmount}>−{formatAmount(use.amount)}</Text>
        </View>
      ))}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, ...shadow.sm },
  center: { alignItems: "center", paddingVertical: spacing.xxl },
  stats: { flexDirection: "row", alignItems: "stretch" },
  stat: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 22, fontWeight: "800", letterSpacing: -0.3, color: colors.textPrimary },
  statLabel: { ...typography.small, color: colors.textSecondary, fontWeight: "600", marginTop: 2 },
  divider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.separator },
  note: { ...typography.small, color: colors.textSecondary, textAlign: "center", marginTop: spacing.sm },
  recentTitle: { ...typography.eyebrow, color: colors.textSecondary, marginTop: spacing.lg, marginBottom: spacing.xs },
  useRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  channel: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
  },
  channelText: { fontSize: 11, fontWeight: "700", color: colors.textPrimary },
  useDate: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  useAmount: { ...typography.body, color: colors.textPrimary, fontWeight: "700" },
  emptyTitle: { ...typography.heading, color: colors.textPrimary, marginBottom: spacing.xs },
  muted: { ...typography.caption, color: colors.textSecondary },
  retry: { marginTop: spacing.sm, alignSelf: "flex-start" },
  retryText: { ...typography.caption, color: colors.textPrimary, fontWeight: "700", textDecorationLine: "underline" },
});
