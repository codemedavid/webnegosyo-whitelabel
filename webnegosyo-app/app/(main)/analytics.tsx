import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { FunctionReference } from "convex/server";
import { useSafeQuery } from "../../lib/hooks";
import { colors, typography, spacing, radius } from "../../theme/colors";
import { Card } from "../../components/Card";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";

const getUpsellAnalyticsRef = "analytics:getUpsellAnalytics" as unknown as FunctionReference<"query">;
const getBundleAnalyticsRef = "analytics:getBundleAnalytics" as unknown as FunctionReference<"query">;
const getTopItemsRef = "analytics:getTopItems" as unknown as FunctionReference<"query">;

interface UpsellStats { shown: number; clicked: number; converted: number; clickRate: number; conversionRate: number; }
interface BundleStats { viewed: number; added: number; conversionRate: number; }
interface TopItem { itemId: string; name: string; count: number; revenue: number; }

export default function AnalyticsScreen() {
  const [daysBack, setDaysBack] = useState(7);

  const { data: upsellStats, error: upsellError } = useSafeQuery<UpsellStats>(getUpsellAnalyticsRef, { daysBack });
  const { data: bundleStats, error: bundleError } = useSafeQuery<BundleStats>(getBundleAnalyticsRef, { daysBack });
  const { data: topItems, error: topItemsError } = useSafeQuery<TopItem[]>(getTopItemsRef, { daysBack, limit: 10 });

  const error = upsellError || bundleError || topItemsError;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Analytics</Text>

      <View style={styles.periodRow}>
        {[7, 14, 30].map((d) => (
          <TouchableOpacity
            key={d}
            style={[styles.periodPill, daysBack === d && styles.periodPillActive]}
            onPress={() => setDaysBack(d)}
            activeOpacity={0.7}
          >
            <Text style={[styles.periodText, daysBack === d && styles.periodTextActive]}>{d} days</Text>
          </TouchableOpacity>
        ))}
      </View>

      {error && <ErrorState message={error} />}

      <Card title="Upsell Performance" style={styles.section}>
        {!upsellStats ? (
          <LoadingState />
        ) : (
          <>
            <View style={styles.funnelRow}>
              <View style={styles.funnelItem}>
                <Text style={styles.funnelValue}>{upsellStats.shown}</Text>
                <Text style={styles.funnelLabel}>Shown</Text>
              </View>
              <Text style={styles.arrow}>→</Text>
              <View style={styles.funnelItem}>
                <Text style={styles.funnelValue}>{upsellStats.clicked}</Text>
                <Text style={styles.funnelLabel}>Clicked</Text>
              </View>
              <Text style={styles.arrow}>→</Text>
              <View style={styles.funnelItem}>
                <Text style={styles.funnelValue}>{upsellStats.converted}</Text>
                <Text style={styles.funnelLabel}>Converted</Text>
              </View>
            </View>
            <View style={styles.rateRow}>
              <View style={styles.rateItem}>
                <Text style={styles.rateValue}>{(upsellStats.clickRate * 100).toFixed(1)}%</Text>
                <Text style={styles.rateLabel}>Click Rate</Text>
              </View>
              <View style={styles.rateItem}>
                <Text style={styles.rateValue}>{(upsellStats.conversionRate * 100).toFixed(1)}%</Text>
                <Text style={styles.rateLabel}>Conversion</Text>
              </View>
            </View>
          </>
        )}
      </Card>

      <Card title="Bundle Performance" style={styles.section}>
        {!bundleStats ? (
          <LoadingState />
        ) : (
          <>
            <View style={styles.funnelRow}>
              <View style={styles.funnelItem}>
                <Text style={styles.funnelValue}>{bundleStats.viewed}</Text>
                <Text style={styles.funnelLabel}>Viewed</Text>
              </View>
              <Text style={styles.arrow}>→</Text>
              <View style={styles.funnelItem}>
                <Text style={styles.funnelValue}>{bundleStats.added}</Text>
                <Text style={styles.funnelLabel}>Added</Text>
              </View>
            </View>
            <View style={styles.rateRow}>
              <View style={styles.rateItem}>
                <Text style={styles.rateValue}>{(bundleStats.conversionRate * 100).toFixed(1)}%</Text>
                <Text style={styles.rateLabel}>Conversion Rate</Text>
              </View>
            </View>
          </>
        )}
      </Card>

      <Card title="Top Items by Revenue" style={styles.section}>
        {!topItems ? (
          <LoadingState />
        ) : topItems.length === 0 ? (
          <EmptyState message="No data yet" />
        ) : (
          topItems.map((item, index) => {
            const maxRevenue = topItems[0]?.revenue ?? 1;
            const barWidthPct = Math.max((item.revenue / maxRevenue) * 100, 5);

            return (
              <View key={item.itemId} style={styles.topItemRow}>
                <Text style={styles.rankText}>#{index + 1}</Text>
                <View style={styles.topItemInfo}>
                  <View style={styles.topItemHeader}>
                    <Text style={styles.topItemName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.topItemRevenue}>₱{item.revenue.toFixed(0)}</Text>
                  </View>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${barWidthPct}%` }]} />
                  </View>
                  <Text style={styles.topItemMeta}>{item.count} sold</Text>
                </View>
              </View>
            );
          })
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: 60 },
  title: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.lg },
  periodRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.xl },
  periodPill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  periodPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  periodText: { ...typography.caption, color: colors.textSecondary, fontWeight: "500" },
  periodTextActive: { color: "#FFFFFF" },
  section: { marginBottom: spacing.lg },
  funnelRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  funnelItem: { alignItems: "center" },
  funnelValue: { fontSize: 24, fontWeight: "700", color: colors.textPrimary },
  funnelLabel: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  arrow: { fontSize: 18, color: colors.textTertiary },
  rateRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 40,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 0.5,
    borderTopColor: colors.separator,
  },
  rateItem: { alignItems: "center" },
  rateValue: { fontSize: 20, fontWeight: "700", color: colors.primary },
  rateLabel: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  topItemRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: spacing.sm, gap: spacing.sm },
  rankText: { ...typography.caption, color: colors.textTertiary, fontWeight: "600", width: 24 },
  topItemInfo: { flex: 1 },
  topItemHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  topItemName: { ...typography.body, color: colors.textPrimary, fontWeight: "500", flex: 1, marginRight: spacing.sm },
  topItemRevenue: { ...typography.body, color: colors.primary, fontWeight: "600" },
  barTrack: { height: 4, backgroundColor: colors.separator, borderRadius: 2, marginTop: spacing.xs },
  barFill: { height: 4, backgroundColor: colors.primary, borderRadius: 2 },
  topItemMeta: { ...typography.small, color: colors.textSecondary, marginTop: 2 },
});
