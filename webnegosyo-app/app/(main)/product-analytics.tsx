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
import { WorkspaceSwitcher } from "../../components/WorkspaceSwitcher";
import { OptionPills } from "../../components/OptionPills";
import { DailyProductBreakdown } from "../../components/DailyProductBreakdown";
import {
  buildProductAnalytics,
  computeProductDeltas,
  previousWindow,
  productDateKey,
  type DailyOrderInput,
  type DailyOrderItemInput,
  type ProductMetric,
} from "../../lib/product-daily-analytics";
import {
  DATE_RANGE_PRESETS,
  METRIC_OPTIONS,
  SOURCE_OPTIONS,
  TOP_N_OPTIONS,
  formatDayLabel,
  listAvailableDays,
  resolveDateWindow,
  resolveSingleDayWindow,
  type DateRangePreset,
} from "../../lib/product-analytics-filters";

const getAllRef = "productAnalytics:getAll" as unknown as FunctionReference<"query">;
const getPortfolioRef = "productAnalytics:getPortfolioSummary" as unknown as FunctionReference<"query">;
const setCostRef = "productCosts:setCost" as unknown as FunctionReference<"mutation">;
const refreshRef = "productAnalyticsAggregator:refreshAnalytics" as unknown as FunctionReference<"action">;
const getOrdersRef = "orders:getOrders" as unknown as FunctionReference<"query">;
const getAllOrderItemsRef = "orders:getAllOrderItems" as unknown as FunctionReference<"query">;

/**
 * Orders pulled for the daily view. Convex's `getOrders` defaults to 50, which
 * would silently clip a 90-day window on a busy store; this asks for the same
 * bounded page the stats reads use.
 */
const ORDER_FETCH_LIMIT = 2000;

/** How many days the single-day picker offers before it gets unwieldy. */
const DAY_PICKER_LIMIT = 14;

/** A raw order as either backend returns it. */
interface BackendOrder {
  _id: string;
  _creationTime: number;
  status: string;
  source?: string;
}

/** A raw line item as either backend returns it. */
interface BackendOrderItem {
  orderId: string;
  menuItemId: string | null;
  menuItemName: string;
  quantity: number;
  subtotal: number;
}

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
  categoryId: string | null;
}

interface CategoryRow {
  id: string;
  name: string;
}

type ViewMode = "daily" | "lifetime";

const VIEW_MODES: readonly { label: string; value: ViewMode }[] = [
  { label: "Day by day", value: "daily" },
  { label: "Lifetime", value: "lifetime" },
];

const PERIODS = [
  { label: "7 Days", value: "7d" },
  { label: "30 Days", value: "30d" },
  { label: "All Time", value: "all" },
];

const BCG: Record<string, { label: string; color: string; bg: string }> = {
  star: { label: "Star", color: colors.statusPending.text, bg: colors.warningLight },
  plowhorse: { label: "Plowhorse", color: colors.info, bg: colors.infoLight },
  puzzle: { label: "Puzzle", color: colors.accent, bg: colors.accentLight },
  dog: { label: "Dog", color: colors.danger, bg: colors.dangerLight },
  unclassified: { label: "No data", color: colors.textSecondary, bg: colors.surfaceSubtle },
};

export default function ProductAnalyticsScreen() {
  const convexUrl = useAuthStore((s) => s.convexUrl);
  const tenantId = useAuthStore((s) => s.tenantId);

  const [period, setPeriod] = useState("30d");
  const [refreshing, setRefreshing] = useState(false);
  const [menuItems, setMenuItems] = useState<MenuRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [editing, setEditing] = useState<AnalyticsRow | null>(null);
  const [costInput, setCostInput] = useState("");
  const [savingCost, setSavingCost] = useState(false);

  // Daily-view filters.
  const [viewMode, setViewMode] = useState<ViewMode>("daily");
  const [preset, setPreset] = useState<DateRangePreset>("7d");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [metric, setMetric] = useState<ProductMetric>("sales");
  const [topN, setTopN] = useState<number | undefined>(10);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [sources, setSources] = useState<string[]>([]);

  /**
   * "Now" is pinned to mount (and to each pull-to-refresh) rather than read
   * during render, so the window boundaries stay stable across re-renders
   * instead of drifting on every keystroke in the search box.
   */
  const [nowMs, setNowMs] = useState(() => Date.now());

  const { data: rows, isLoading } = useSafeQuery<AnalyticsRow[]>(getAllRef, { period });
  const { data: portfolio } = useSafeQuery<Portfolio>(getPortfolioRef, { period });
  const { data: backendOrders, isLoading: ordersLoading } = useSafeQuery<BackendOrder[]>(
    getOrdersRef,
    { limit: ORDER_FETCH_LIMIT }
  );
  const { data: backendItems, isMissingFunction: itemsMissing } =
    useSafeQuery<BackendOrderItem[]>(getAllOrderItemsRef, {});
  const setCost = useSafeMutation(setCostRef);
  const refreshAnalytics = useSafeAction(refreshRef);

  // Load the full menu so every available product shows, even with no sales.
  useEffect(() => {
    let cancelled = false;
    if (!tenantId) return;
    (async () => {
      const [items, cats] = await Promise.all([
        supabase
          .from("menu_items")
          .select("id, name, category_id")
          .eq("tenant_id", tenantId)
          .order("name", { ascending: true }),
        supabase
          .from("categories")
          .select("id, name")
          .eq("tenant_id", tenantId)
          .order("name", { ascending: true }),
      ]);
      if (cancelled) return;
      if (items.data) {
        setMenuItems(
          items.data.map((m) => ({
            id: m.id as string,
            name: m.name as string,
            categoryId: (m.category_id as string | null) ?? null,
          }))
        );
      }
      if (cats.data) {
        setCategories(cats.data.map((c) => ({ id: c.id as string, name: c.name as string })));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  // --- daily view -----------------------------------------------------------

  const orderInputs: DailyOrderInput[] = useMemo(
    () =>
      (backendOrders ?? []).map((o) => ({
        id: o._id,
        createdAtMs: o._creationTime,
        status: o.status,
        source: o.source,
      })),
    [backendOrders]
  );

  const itemInputs: DailyOrderItemInput[] = useMemo(
    () =>
      (backendItems ?? [])
        .filter((i) => !!i.menuItemId)
        .map((i) => ({
          orderId: i.orderId,
          menuItemId: i.menuItemId as string,
          menuItemName: i.menuItemName,
          quantity: i.quantity,
          subtotal: i.subtotal,
        })),
    [backendItems]
  );

  const categoryByItemId = useMemo(() => {
    const map: Record<string, string> = {};
    for (const item of menuItems) {
      if (item.categoryId) map[item.id] = item.categoryId;
    }
    return map;
  }, [menuItems]);

  const todayKey = useMemo(() => productDateKey(nowMs), [nowMs]);

  const availableDays = useMemo(
    () => listAvailableDays(orderInputs).slice(0, DAY_PICKER_LIMIT),
    [orderInputs]
  );

  const dateWindow = useMemo(
    () =>
      selectedDay
        ? resolveSingleDayWindow(selectedDay)
        : resolveDateWindow(preset, nowMs),
    [selectedDay, preset, nowMs]
  );

  const daily = useMemo(
    () =>
      buildProductAnalytics(orderInputs, itemInputs, {
        metric,
        topN,
        search,
        categoryId: categoryId ?? undefined,
        categoryByItemId,
        sources,
        startMs: dateWindow.startMs,
        endMs: dateWindow.endMs,
      }),
    [orderInputs, itemInputs, metric, topN, search, categoryId, categoryByItemId, sources, dateWindow]
  );

  const deltas = useMemo(() => {
    const before = previousWindow(dateWindow.startMs, dateWindow.endMs);
    const previous = buildProductAnalytics(orderInputs, itemInputs, {
      metric,
      search,
      categoryId: categoryId ?? undefined,
      categoryByItemId,
      sources,
      startMs: before.startMs,
      endMs: before.endMs,
    });
    return computeProductDeltas(daily.totals, previous.totals);
  }, [daily, orderInputs, itemInputs, metric, search, categoryId, categoryByItemId, sources, dateWindow]);

  const windowTotals = useMemo(
    () =>
      daily.days.reduce(
        (acc, day) => ({
          units: acc.units + day.totalUnits,
          sales: acc.sales + day.totalSales,
          orders: acc.orders + day.totalOrders,
        }),
        { units: 0, sales: 0, orders: 0 }
      ),
    [daily]
  );

  const toggleSource = useCallback((value: string) => {
    setSources((current) =>
      current.includes(value) ? current.filter((s) => s !== value) : [...current, value]
    );
  }, []);

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
      setNowMs(Date.now());
      setTimeout(() => setRefreshing(false), 400);
      return;
    }
    setRefreshing(true);
    setNowMs(Date.now());
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
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Products</Text>
            <Text style={styles.subtitle}>Sales performance for every menu item</Text>
          </View>
          <WorkspaceSwitcher />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        <OptionPills
          options={VIEW_MODES}
          isSelected={(value) => viewMode === value}
          onSelect={setViewMode}
          accessibilityPrefix="View"
        />

        {viewMode === "daily" ? (
          <>
            <View style={styles.filterBlock}>
              <Text style={styles.filterLabel}>Period</Text>
              <OptionPills
                options={DATE_RANGE_PRESETS}
                isSelected={(value) => selectedDay === null && preset === value}
                onSelect={(value) => {
                  setSelectedDay(null);
                  setPreset(value);
                }}
                accessibilityPrefix="Show"
              />
            </View>

            {availableDays.length > 0 && (
              <View style={styles.filterBlock}>
                <Text style={styles.filterLabel}>Jump to a day</Text>
                <OptionPills
                  options={availableDays.map((day) => ({
                    label: formatDayLabel(day, todayKey),
                    value: day as string | null,
                  }))}
                  isSelected={(value) => selectedDay === value}
                  onSelect={(value) => setSelectedDay(selectedDay === value ? null : value)}
                  accessibilityPrefix="Show only"
                />
              </View>
            )}

            <View style={styles.filterBlock}>
              <Text style={styles.filterLabel}>Rank by</Text>
              <OptionPills
                options={METRIC_OPTIONS}
                isSelected={(value) => metric === value}
                onSelect={setMetric}
                accessibilityPrefix="Rank by"
              />
            </View>

            <View style={styles.filterBlock}>
              <Text style={styles.filterLabel}>Show per day</Text>
              <OptionPills
                options={TOP_N_OPTIONS}
                isSelected={(value) => topN === value}
                onSelect={setTopN}
                accessibilityPrefix="Show"
              />
            </View>

            <View style={styles.filterBlock}>
              <Text style={styles.filterLabel}>Channel</Text>
              <OptionPills
                options={SOURCE_OPTIONS}
                isSelected={(value) => sources.includes(value)}
                onSelect={toggleSource}
                accessibilityPrefix="Toggle channel"
              />
            </View>

            {categories.length > 0 && (
              <View style={styles.filterBlock}>
                <Text style={styles.filterLabel}>Category</Text>
                <OptionPills
                  options={[
                    { label: "All", value: null as string | null },
                    ...categories.map((c) => ({ label: c.name, value: c.id as string | null })),
                  ]}
                  isSelected={(value) => categoryId === value}
                  onSelect={setCategoryId}
                  accessibilityPrefix="Category"
                />
              </View>
            )}

            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search products"
              placeholderTextColor={colors.textTertiary}
              autoCorrect={false}
              accessibilityLabel="Search products by name"
            />

            <View style={styles.summaryCard}>
              <View style={styles.summaryCell}>
                <Text style={styles.summaryValue}>{formatPeso(windowTotals.sales)}</Text>
                <Text style={styles.summaryLabel}>Sales</Text>
              </View>
              <View style={styles.summaryCell}>
                <Text style={styles.summaryValue}>{formatCount(windowTotals.orders)}</Text>
                <Text style={styles.summaryLabel}>Orders</Text>
              </View>
              <View style={styles.summaryCell}>
                <Text style={styles.summaryValue}>{formatCount(windowTotals.units)}</Text>
                <Text style={styles.summaryLabel}>Units</Text>
              </View>
            </View>

            {itemsMissing ? (
              <ErrorState message="This store's backend needs an update before day-by-day product sales can be shown." />
            ) : ordersLoading && orderInputs.length === 0 ? (
              <LoadingState message="Loading daily sales..." />
            ) : daily.days.length === 0 ? (
              <EmptyState message="No product sales matched these filters." />
            ) : (
              <DailyProductBreakdown
                days={daily.days}
                deltas={deltas}
                metric={metric}
                todayKey={todayKey}
              />
            )}
          </>
        ) : (
          <>
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
          </>
        )}
      </ScrollView>

      {/* Cost-entry modal */}
      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editing?.menuItemName}</Text>
            <Text style={styles.modalSubtitle}>
              Enter what this item costs you to make. This enables margin and BCG classification.
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
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  title: { ...typography.title, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  content: { padding: spacing.xl, paddingTop: spacing.md },
  filterBlock: { marginBottom: spacing.xs },
  filterLabel: {
    ...typography.caption,
    color: colors.textTertiary,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.card,
    marginBottom: spacing.md,
  },
  summaryCard: {
    flexDirection: "row",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadow.sm,
  },
  summaryCell: { flex: 1, alignItems: "center" },
  summaryValue: { ...typography.body, color: colors.textPrimary, fontWeight: "800" },
  summaryLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textSecondary,
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  chipsRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
  chip: { flex: 1, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: "center" },
  chipCount: { fontSize: 20, fontWeight: "800" },
  chipLabel: { fontSize: 10, fontWeight: "700", marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 },
  row: { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.sm, ...shadow.sm },
  rowHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rank: { ...typography.caption, color: colors.textTertiary, fontWeight: "700", width: 28 },
  name: { ...typography.body, color: colors.textPrimary, fontWeight: "600", flex: 1 },
  bcgBadge: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  bcgText: { fontSize: 10, fontWeight: "700" },
  barTrack: { height: 5, backgroundColor: colors.surfaceSubtle, borderRadius: 3, marginTop: spacing.sm },
  barFill: { height: 5, backgroundColor: colors.accent, borderRadius: 3 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.sm },
  metaStrong: { ...typography.body, color: colors.textPrimary, fontWeight: "700" },
  metaText: { ...typography.caption, color: colors.textSecondary },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(29,24,21,0.45)", justifyContent: "center", padding: spacing.xl },
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
  modalSave: { backgroundColor: colors.primary, borderRadius: radius.full, paddingVertical: spacing.md, paddingHorizontal: spacing.xl },
  modalSaveText: { ...typography.body, color: colors.textOnDark, fontWeight: "700" },
});
