import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";

import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import { formatCount, formatPeso } from "../../lib/format";
import {
  customerLabel,
  lastVisitLabel,
  type DashboardCustomer,
} from "../../lib/customer-hub/dashboard";
import { Icon } from "../Icon";
import { ListRow } from "../ListRow";

interface BestCustomersCardProps {
  customers: readonly DashboardCustomer[];
  nowMs: number;
  onOpenCustomer: (customerId: string) => void;
  /** Absent when this account cannot open the guest list. */
  onSeeAll?: () => void;
}

function avatarColor(key: string): string {
  const palette = colors.avatarPalette;
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}

/**
 * The handful of people the period's money leaned on most. A name, how often
 * they came, when they were last in, and what they spent — enough to know who
 * to greet by name, and who to call if they stop coming.
 */
export function BestCustomersCard({ customers, nowMs, onOpenCustomer, onSeeAll }: BestCustomersCardProps) {
  return (
    <View style={styles.card}>
      {customers.length === 0 ? (
        <Text style={styles.empty}>No named guests ordered in this period yet.</Text>
      ) : (
        customers.map((customer, index) => {
          const label = customerLabel(customer);
          const customerId = customer.customerId;
          const body = (
            <>
              <View style={[styles.avatar, { backgroundColor: avatarColor(customer.key) }]}>
                <Text style={styles.avatarText}>{label.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.copy}>
                <Text style={styles.name} numberOfLines={1}>
                  {label}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {formatCount(customer.visits)} {customer.visits === 1 ? "visit" : "visits"} ·{" "}
                  {lastVisitLabel(customer.lastVisitAt, nowMs)}
                </Text>
              </View>
              <Text style={styles.spend}>{formatPeso(customer.spend, 0)}</Text>
              {customerId ? <Icon name="chevron" size={16} color={colors.textTertiary} /> : null}
            </>
          );
          const rowStyle = [styles.row, index > 0 && styles.divided];
          return customerId ? (
            <TouchableOpacity
              key={customer.key}
              style={rowStyle}
              onPress={() => onOpenCustomer(customerId)}
              accessibilityRole="button"
              accessibilityLabel={`${label}, ${customer.visits} visits, spent ${formatPeso(customer.spend, 0)}`}
            >
              {body}
            </TouchableOpacity>
          ) : (
            <View key={customer.key} style={rowStyle}>
              {body}
            </View>
          );
        })
      )}
      {onSeeAll ? (
        <ListRow title="See all guests" icon="customers" onPress={onSeeAll} style={styles.seeAll} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    overflow: "hidden",
    ...shadow.sm,
  },
  empty: { ...typography.caption, color: colors.textSecondary, paddingVertical: spacing.lg },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  avatarText: { ...typography.body, fontWeight: "800", color: colors.textOnDark },
  copy: { flex: 1, gap: 2 },
  name: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  meta: { ...typography.caption, color: colors.textSecondary },
  spend: { ...typography.body, fontWeight: "800", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  seeAll: {
    marginHorizontal: -spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
});
