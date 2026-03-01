import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { useQuery } from "convex/react";
import { FunctionReference } from "convex/server";

const getUpsellAnalyticsRef = "analytics:getUpsellAnalytics" as unknown as FunctionReference<"query">;
const getBundleAnalyticsRef = "analytics:getBundleAnalytics" as unknown as FunctionReference<"query">;
const getTopItemsRef = "analytics:getTopItems" as unknown as FunctionReference<"query">;

interface UpsellStats {
  shown: number;
  clicked: number;
  converted: number;
  clickRate: number;
  conversionRate: number;
}

interface BundleStats {
  viewed: number;
  added: number;
  conversionRate: number;
}

interface TopItem {
  itemId: string;
  name: string;
  count: number;
  revenue: number;
}

export default function AnalyticsScreen() {
  const [daysBack, setDaysBack] = useState(7);

  const upsellStats = useQuery(getUpsellAnalyticsRef, { daysBack }) as UpsellStats | undefined;
  const bundleStats = useQuery(getBundleAnalyticsRef, { daysBack }) as BundleStats | undefined;
  const topItems = useQuery(getTopItemsRef, { daysBack, limit: 10 }) as TopItem[] | undefined;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Analytics</Text>

      {/* Period selector */}
      <View style={styles.periodRow}>
        {[7, 14, 30].map((d) => (
          <TouchableOpacity
            key={d}
            style={[styles.periodTab, daysBack === d && styles.periodTabActive]}
            onPress={() => setDaysBack(d)}
          >
            <Text style={[styles.periodText, daysBack === d && styles.periodTextActive]}>
              {d}d
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Upsell Funnel */}
      <Text style={styles.sectionTitle}>Upsell Performance</Text>
      {upsellStats ? (
        <View style={styles.card}>
          <View style={styles.funnelRow}>
            <View style={styles.funnelItem}>
              <Text style={styles.funnelValue}>{upsellStats.shown}</Text>
              <Text style={styles.funnelLabel}>Shown</Text>
            </View>
            <Text style={styles.funnelArrow}>{"\u2192"}</Text>
            <View style={styles.funnelItem}>
              <Text style={styles.funnelValue}>{upsellStats.clicked}</Text>
              <Text style={styles.funnelLabel}>Clicked</Text>
            </View>
            <Text style={styles.funnelArrow}>{"\u2192"}</Text>
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
              <Text style={styles.rateLabel}>Conversion Rate</Text>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.card}><Text style={styles.loadingText}>Loading...</Text></View>
      )}

      {/* Bundle Performance */}
      <Text style={styles.sectionTitle}>Bundle Performance</Text>
      {bundleStats ? (
        <View style={styles.card}>
          <View style={styles.funnelRow}>
            <View style={styles.funnelItem}>
              <Text style={styles.funnelValue}>{bundleStats.viewed}</Text>
              <Text style={styles.funnelLabel}>Viewed</Text>
            </View>
            <Text style={styles.funnelArrow}>{"\u2192"}</Text>
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
        </View>
      ) : (
        <View style={styles.card}><Text style={styles.loadingText}>Loading...</Text></View>
      )}

      {/* Top Items */}
      <Text style={styles.sectionTitle}>Top Items by Revenue</Text>
      <View style={styles.card}>
        {!topItems ? (
          <Text style={styles.loadingText}>Loading...</Text>
        ) : topItems.length === 0 ? (
          <Text style={styles.emptyText}>No data yet</Text>
        ) : (
          topItems.map((item, index) => (
            <View key={item.itemId} style={styles.topItemRow}>
              <View style={styles.topItemRank}>
                <Text style={styles.rankText}>#{index + 1}</Text>
              </View>
              <View style={styles.topItemInfo}>
                <Text style={styles.topItemName}>{item.name}</Text>
                <Text style={styles.topItemMeta}>{item.count} sold</Text>
              </View>
              <Text style={styles.topItemRevenue}>{"\u20B1"}{item.revenue.toFixed(0)}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F0F0F" },
  content: { padding: 20 },
  heading: { fontSize: 28, fontWeight: "bold", color: "#fff", marginBottom: 16 },
  periodRow: { flexDirection: "row", gap: 8, marginBottom: 20 },
  periodTab: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, backgroundColor: "#1A1A1A", borderWidth: 1, borderColor: "#2A2A2A" },
  periodTabActive: { backgroundColor: "#4F46E5", borderColor: "#4F46E5" },
  periodText: { color: "#999", fontSize: 14, fontWeight: "500" },
  periodTextActive: { color: "#fff" },
  sectionTitle: { fontSize: 18, fontWeight: "600", color: "#fff", marginBottom: 12, marginTop: 8 },
  card: { backgroundColor: "#1A1A1A", borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: "#2A2A2A" },
  funnelRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 12 },
  funnelItem: { alignItems: "center" },
  funnelValue: { fontSize: 24, fontWeight: "bold", color: "#fff" },
  funnelLabel: { fontSize: 12, color: "#999", marginTop: 4 },
  funnelArrow: { fontSize: 20, color: "#4F46E5" },
  rateRow: { flexDirection: "row", justifyContent: "center", gap: 32, marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#2A2A2A" },
  rateItem: { alignItems: "center" },
  rateValue: { fontSize: 20, fontWeight: "bold", color: "#4F46E5" },
  rateLabel: { fontSize: 12, color: "#999", marginTop: 2 },
  topItemRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#2A2A2A" },
  topItemRank: { width: 32 },
  rankText: { color: "#666", fontWeight: "600", fontSize: 14 },
  topItemInfo: { flex: 1 },
  topItemName: { color: "#fff", fontSize: 14, fontWeight: "500" },
  topItemMeta: { color: "#999", fontSize: 12, marginTop: 2 },
  topItemRevenue: { color: "#4F46E5", fontSize: 16, fontWeight: "bold" },
  loadingText: { color: "#999", textAlign: "center", paddingVertical: 12 },
  emptyText: { color: "#666", textAlign: "center", paddingVertical: 12 },
});
