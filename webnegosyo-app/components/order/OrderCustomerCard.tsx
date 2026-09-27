import React, { useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, type ViewStyle } from "react-native";
import { router } from "expo-router";
import { colors, typography, spacing, radius } from "../../theme/colors";
import { Card } from "../Card";
import { MemberProgressBar } from "../loyalty/MemberProgress";
import { TONE_COLORS } from "../loyalty/tone-colors";
import { formatPeso } from "../../lib/format";
import { loyaltyMemberHref } from "../../lib/navigation";
import { useOrderCustomers } from "../../lib/query/use-order-customers";
import {
  describeBalance,
  describeMemberStatus,
  describeRemaining,
} from "../../lib/loyalty/members";
import {
  describeOrderStamp,
  type OrderCustomerSource,
  type OrderCustomerSummary,
} from "../../lib/loyalty/order-customers";

interface OrderCustomerCardProps {
  order: OrderCustomerSource;
  style?: ViewStyle;
}

/**
 * The customer behind this order, when the store knows them.
 *
 * Answers the three questions a cashier asks at the counter — is this a
 * member, did this order earn a stamp, what have they ordered before — and
 * opens their profile for the rest. Draws nothing for a walk-in, or for a
 * staff member without `loyalty_manage`.
 */
export function OrderCustomerCard({ order, style }: OrderCustomerCardProps) {
  const orders = useMemo(() => [order], [order]);
  const { byOrderId, isLoyaltyLive, isEnabled, isLoading, error, refetch } = useOrderCustomers(orders);

  if (!isEnabled) return null;

  if (isLoading) {
    return (
      <Card title="Customer profile" style={style}>
        <Text style={styles.muted}>Checking for a customer profile…</Text>
      </Card>
    );
  }

  if (error) {
    return (
      <Card title="Customer profile" style={style}>
        <Text style={styles.muted}>Could not check this customer&apos;s profile or stamps.</Text>
        <TouchableOpacity onPress={() => void refetch()} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.link}>Try again</Text>
        </TouchableOpacity>
      </Card>
    );
  }

  const customer = byOrderId.get(order._id);
  if (!customer) return null;

  return (
    <Card title={customer.isMember ? "Loyalty member" : "Customer profile"} style={style}>
      <CustomerSummary customer={customer} isLoyaltyLive={isLoyaltyLive} onRefresh={() => void refetch()} />
    </Card>
  );
}

function CustomerSummary({
  customer,
  isLoyaltyLive,
  onRefresh,
}: {
  customer: OrderCustomerSummary;
  isLoyaltyLive: boolean;
  onRefresh: () => void;
}) {
  const name = customer.name?.trim() || "Guest";
  const stamp = describeOrderStamp(customer, isLoyaltyLive);
  const statusLine = customer.status
    ? describeMemberStatus(customer.status).label
    : customer.isMember
      ? "Member"
      : "No stamp card yet";

  return (
    <View style={styles.body}>
      <Text style={styles.name}>{name}</Text>
      <Text style={styles.muted}>{statusLine}</Text>

      {stamp ? (
        <View style={[styles.stamp, { backgroundColor: TONE_COLORS[stamp.tone].bg }]}>
          <Text style={[styles.stampTitle, { color: TONE_COLORS[stamp.tone].text }]}>{stamp.title}</Text>
          {stamp.detail ? <Text style={styles.stampDetail}>{stamp.detail}</Text> : null}
        </View>
      ) : null}

      {customer.headline ? (
        <View style={styles.progress}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>{customer.headline.programName}</Text>
            <Text style={styles.progressValue}>{describeBalance(customer.headline)}</Text>
          </View>
          <MemberProgressBar progress={customer.headline} />
          <Text style={styles.muted}>{describeRemaining(customer.headline)}</Text>
        </View>
      ) : null}

      {customer.rewardsAvailable > 0 ? (
        <Text style={styles.reward}>
          {customer.rewardsAvailable} reward{customer.rewardsAvailable === 1 ? "" : "s"} ready to claim
        </Text>
      ) : null}

      {customer.hasProfile ? (
        <View style={styles.stats}>
          <Stat label="Orders" value={String(customer.orderCount ?? 0)} />
          <Stat label="Spent" value={formatPeso(customer.totalSpent ?? 0, 0)} />
        </View>
      ) : null}

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.profileButton}
          onPress={() => router.push(loyaltyMemberHref(customer.customerKey))}
          accessibilityRole="button"
          accessibilityLabel={`Open ${name}'s profile and order history`}
        >
          <Text style={styles.profileButtonText}>View profile & order history</Text>
        </TouchableOpacity>
        {customer.stamp.state === "pending" ? (
          <TouchableOpacity onPress={onRefresh} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.link}>Refresh</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.xs },
  name: { ...typography.heading, color: colors.textPrimary },
  muted: { ...typography.caption, color: colors.textSecondary },
  link: { ...typography.caption, color: colors.accent, fontWeight: "700" },
  stamp: { borderRadius: radius.md, padding: spacing.sm, marginTop: spacing.xs, gap: 2 },
  stampTitle: { ...typography.body, fontWeight: "800" },
  stampDetail: { ...typography.small, color: colors.textSecondary },
  progress: { marginTop: spacing.xs, gap: 4 },
  progressHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  progressLabel: { ...typography.caption, color: colors.textPrimary, fontWeight: "600" },
  progressValue: { ...typography.caption, color: colors.textPrimary, fontWeight: "800" },
  reward: { ...typography.caption, color: colors.success, fontWeight: "700" },
  stats: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xs },
  stat: { flex: 1 },
  statValue: { ...typography.body, fontWeight: "800", color: colors.textPrimary },
  statLabel: { ...typography.small, color: colors.textSecondary },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  profileButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  profileButtonText: { ...typography.caption, color: colors.textOnDark, fontWeight: "700" },
});
