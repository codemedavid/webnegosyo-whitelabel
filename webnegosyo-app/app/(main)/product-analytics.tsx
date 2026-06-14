import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
} from "react-native";
import { FunctionReference } from "convex/server";
import { useSafeQuery, useSafeMutation, useSafeAction } from "../../lib/hooks";
import { useAuthStore } from "../../stores/auth-store";
import { DEMO_READONLY_MESSAGE } from "../../lib/demo";
import { supabase } from "../../lib/supabase";
import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import { formatPeso, formatCount } from "../../lib/format";
import { LoadingState } from "../../components/LoadingState";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { PeriodSelector } from "../../components/PeriodSelector";

const getAllRef = "productAnalytics:getAll" as unknown as FunctionReference<"query">;
const getPortfolioRef = "productAnalytics:getPortfolioSummary" as unknown as FunctionReference<"query">;
const setCostRef = "productCosts:setCost" as unknown as FunctionReference<"mutation">;
const refreshRef = "productAnalyticsAggregator:refreshAnalytics" as unknown as FunctionReference<"action">;

interface AnalyticsRow {
  menuItemId: string;
  menuItemName?: string;
  totalUnitsSold: number;
  totalRevenue: number;
  marginPercent?: number;
  avgDailyUnits: number;
  bcgClassification: string;
  recommendation: string;
  hasData?: boolean;
}

interface Portfolio {
  counts: { star: number; puzzle: number; plowhorse: number; dog: number; unclassified: number };
  totalProducts: number;
  starRevenuePercent: number;
}

interface MenuRow {
  id: string;
  name: string;
}

const PERIODS = [
  { label: "7 Days", value: "7d" },
  { label: "30 Days", value: "30d" },
  { label: "All Time", value: "all" },
];

const BCG: Record<string, { label: string; color: string; bg: string }> = {
  star: { label: "Star", color: "#A16207", bg: "#FEF9C3" },
  plowhorse: { label: "Plowhorse", color: "#1D4ED8", bg: "#DBEAFE" },
  puzzle: { label: "Puzzle", color: "#7E22CE", bg: "#F3E8FF" },
  dog: { label: "Dog", color: "#DC2626", bg: "#FEE2E2" },
  unclassified: { label: "No data", color: colors.textSecondary, bg: colors.separator },
};

export default function ProductAnalyticsScreen() {
  const convexUrl = useAuthStore((s) => s.convexUrl);
  const tenantId = useAuthStore((s) => s.tenantId);

  const [period, setPeriod] = useState("30d");
  const [refreshing, setRefreshing] = useState(false);
  const [menuItems, setMenuItems] = useState<MenuRow[]>([]);
  const [editing, setEditing] = useState<AnalyticsRow | null>(null);
  const [costInput, setCostInput] = useState("");
  const [savingCost, setSavingCost] = useState(false);

  const { data: rows, isLoading } = useSafeQuery<AnalyticsRow[]>(getAllRef, { period });
  const { data: portfolio } = useSafeQuery<Portfolio>(getPortfolioRef, { period });
  const setCost = useSafeMutation(setCostRef);
  const refreshAnalytics = useSafeAction(refreshRef);

  // Load the full menu so every available product shows, even with no sales.
  useEffect(() => {
    let cancelled = false;
    if (!tenantId) return;
    (async () => {
      const { data } = await supabase
        .from("menu_items")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .order("name", { ascending: true });
      if (!cancelled && data) {
        setMenuItems(data.map((m) => ({ id: m.id as string, name: m.name as string })));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const merged: AnalyticsRow[] = useMemo(() => {
    const byId = new Map<string, AnalyticsRow>();
    for (const a of rows ?? []) byId.set(a.menuItemId, { ...a, hasData: true });

    const seen = new Set<string>();
    const out: AnalyticsRow[] = [];
    for (const mi of menuItems) {
      seen.add(mi.id);
      const a = byId.get(mi.id);
      out.push(
        a
          ? { ...a, menuItemName: a.menuItemName ?? mi.name }
          : {
              menuItemId: mi.id,
              menuItemName: mi.name,
              totalUnitsSold: 0,
              totalRevenue: 0,
              marginPercent: undefined,
              avgDailyUnits: 0,
              bcgClassification: "unclassified",
              recommendation: "No sales in this period yet.",
              hasData: false,
            }
      );
    }
    for (const a of rows ?? []) {
      if (!seen.has(a.menuItemId)) out.push({ ...a, hasData: true });
    }
    return out.sort((x, y) => y.totalRevenue - x.totalRevenue);
  }, [rows, menuItems]);

  const onRefresh = useCallback(async () => {
    // Demo sessions are read-only. refreshAnalytics is an unauthenticated Convex
    // action that writes aggregated rows to the real sample store, so block the
    // write for demo guests and just acknowledge the pull gesture.
    if (useAuthStore.getState().isDemo) {
      setRefreshing(true);
      setTimeout(() => setRefreshing(false), 400);
      return;
    }
    setRefreshing(true);
    try {
      await refreshAnalytics();
    } catch {
      // Action may be unavailable on an older deployment — ignore.
    } finally {
      setRefreshing(false);
    }
  }, [refreshAnalytics]);

  const openCostEditor = (row: AnalyticsRow) => {
    setEditing(row);
    setCostInput("");
  };

  const handleSaveCost = async () => {
    if (!editing) return;
    if (useAuthStore.getState().isDemo) {
      Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
      return;
    }
    const cost = parseFloat(costInput);
    if (isNaN(cost) || cost < 0) {
      Alert.alert("Invalid cost", "Enter a valid cost price (a number ≥ 0).");
      return;
    }
    setSavingCost(true);
    try {
      await setCost({ menuItemId: editing.menuItemId, costPrice: cost });
      setEditing(null);
      setCostInput("");
      Alert.alert("Saved", "Cost saved. Pull down to refresh and recompute margins.");
    } catch {
      Alert.alert("Error", "Could not save the cost price.");
    } finally {
      setSavingCost(false);
    }
  };

  if (!convexUrl) {
    return (
      <View style={styles.screen}>
        <View style={styles.headerWrap}>
          <Text style={styles.title}>Products</Text>
        </View>
        <ErrorState message="Product analytics requires Convex to be configured for this store." />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.headerWrap}>
        <Text style={styles.title}>Products</Text>
        <Text style={styles.subtitle}>Sales performance for every menu item</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        <PeriodSelector periods={PERIODS} selected={period} onSelect={setPeriod} />

        {portfolio && portfolio.totalProducts > 0 && (
          <View style={styles.chipsRow}>
            {(["star", "plowhorse", "puzzle", "dog"] as const).map((cls) => (
              <View key={cls} style={[styles.chip, { backgroundColor: BCG[cls].bg }]}>
                <Text style={[styles.chipCount, { color: BCG[cls].color }]}>
                  {portfolio.counts[cls]}
                </Text>
                <Text style={[styles.chipLabel, { color: BCG[cls].color }]}>{BCG[cls].label}</Text>
              </View>
            ))}
          </View>
        )}

        {isLoading && menuItems.length === 0 ? (
          <LoadingState message="Loading products..." />
        ) : merged.length === 0 ? (
          <EmptyState message="No products on the menu yet." />
        ) : (
          merged.map((item, index) => {
            const bcg = BCG[item.bcgClassification] ?? BCG.unclassified;
            const maxRevenue = merged[0]?.totalRevenue || 1;
            const barPct = Math.max((item.totalRevenue / maxRevenue) * 100, item.totalRevenue > 0 ? 4 : 0);
            return (
              <TouchableOpacity
                key={item.menuItemId}
                style={styles.row}
                activeOpacity={0.7}
                onPress={() => openCostEditor(item)}
                accessibilityRole="button"
                accessibilityLabel={`${item.menuItemName}, ${formatPeso(item.totalRevenue)} revenue, set cost price`}
              >
                <View style={styles.rowHeader}>
                  <Text style={styles.rank}>#{index + 1}</Text>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.menuItemName}
                  </Text>
                  <View style={[styles.bcgBadge, { backgroundColor: bcg.bg }]}>
                    <Text style={[styles.bcgText, { color: bcg.color }]}>{bcg.label}</Text>
                  </View>
                </View>

                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${barPct}%` }]} />
                </View>

                <View style={styles.metaRow}>
                  <Text style={styles.metaStrong}>{formatPeso(item.totalRevenue)}</Text>
                  <Text style={styles.metaText}>
                    {formatCount(item.totalUnitsSold)} sold
                    {item.marginPercent !== undefined ? ` · ${item.marginPercent.toFixed(0)}% margin` : " · tap to add cost"}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Cost-entry modal */}
      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editing?.menuItemName}</Text>
            <Text style={styles.modalSubtitle}>
              Enter what this item costs you to make. This unlocks margin and BCG classification.
            </Text>
            <TextInput
              style={styles.modalInput}
              value={costInput}
              onChangeText={setCostInput}
              keyboardType="decimal-pad"
              placeholder="Cost price (₱)"
              placeholderTextColor={colors.textTertiary}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setEditing(null)}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSave, savingCost && { opacity: 0.6 }]}
                onPress={handleSaveCost}
                disabled={savingCost}
                accessibilityRole="button"
                accessibilityLabel="Save cost price"
              >
                <Text style={styles.modalSaveText}>{savingCost ? "Saving..." : "Save"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  headerWrap: { paddingHorizontal: spacing.xl, paddingTop: 60, paddingBottom: spacing.md },
  title: { ...typography.title, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  content: { padding: spacing.xl, paddingTop: spacing.md },
  chipsRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
  chip: { flex: 1, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: "center" },
  chipCount: { fontSize: 20, fontWeight: "700" },
  chipLabel: { fontSize: 10, fontWeight: "600", marginTop: 2 },
  row: { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.sm, ...shadow.sm },
  rowHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rank: { ...typography.caption, color: colors.textTertiary, fontWeight: "700", width: 28 },
  name: { ...typography.body, color: colors.textPrimary, fontWeight: "600", flex: 1 },
  bcgBadge: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  bcgText: { fontSize: 10, fontWeight: "700" },
  barTrack: { height: 5, backgroundColor: colors.separator, borderRadius: 3, marginTop: spacing.sm },
  barFill: { height: 5, backgroundColor: colors.primary, borderRadius: 3 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.sm },
  metaStrong: { ...typography.body, color: colors.primary, fontWeight: "700" },
  metaText: { ...typography.caption, color: colors.textSecondary },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: spacing.xl },
  modalCard: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.xl },
  modalTitle: { ...typography.heading, color: colors.textPrimary },
  modalSubtitle: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.lg },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.textPrimary,
  },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.md, marginTop: spacing.lg },
  modalCancel: { paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  modalCancelText: { ...typography.body, color: colors.textSecondary, fontWeight: "600" },
  modalSave: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.xl },
  modalSaveText: { ...typography.body, color: "#FFFFFF", fontWeight: "700" },
});
