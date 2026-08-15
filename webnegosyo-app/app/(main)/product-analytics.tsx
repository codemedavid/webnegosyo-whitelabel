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
import { hasLiveOrderBackend } from "../../lib/order-backend";
import { supabase } from "../../lib/supabase";
import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import { formatPeso, formatCount } from "../../lib/format";
import { LoadingState } from "../../components/LoadingState";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { PeriodSelector } from "../../components/PeriodSelector";
import { WorkspaceSwitcher } from "../../components/WorkspaceSwitcher";
import { SegmentedControl } from "../../components/SegmentedControl";
import { FilterChipsRow } from "../../components/FilterChipsRow";
import { ProductFilterSheet } from "../../components/ProductFilterSheet";
import { DailyProductBreakdown } from "../../components/DailyProductBreakdown";
import {
  buildProductAnalytics,
  computeProductDeltas,
  previousWindow,
  productDateKey,
  type DailyOrderInput,
  type DailyOrderItemInput,
} from "../../lib/product-daily-analytics";
import {
  DATE_RANGE_PRESETS,
  formatDayLabel,
  listAvailableDays,
  resolveDateWindow,
  resolveSingleDayWindow,
  type DateRangePreset,
} from "../../lib/product-analytics-filters";
import { useDebouncedValue } from "../../lib/use-debounced-value";
import {
  DEFAULT_PRODUCT_FILTERS,
  buildFilterChips,
  clearAllFilters,
  clearChip,
  countActiveFilters,
  type ProductFilterState,
} from "../../lib/product-filter-summary";

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
  const orderBackend = useAuthStore((s) => s.orderBackend);
  const hasBackend = hasLiveOrderBackend({ convexUrl, orderBackend });
  const tenantId = useAuthStore((s) => s.tenantId);

  const [period, setPeriod] = useState("30d");
  const [refreshing, setRefreshing] = useState(false);
  const [menuItems, setMenuItems] = useState<MenuRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [editing, setEditing] = useState<AnalyticsRow | null>(null);
  const [costInput, setCostInput] = useState("");
  const [savingCost, setSavingCost] = useState(false);

  // Daily-view filters.
  //
  // The period stays inline because it is the one a merchant changes every time
  // they open the screen; the rest live in a sheet and are held together in one
  // object so clearing a single chip, or all of them, is one honest replacement
  // rather than five setters that can drift out of step.
  const [viewMode, setViewMode] = useState<ViewMode>("daily");
  const [preset, setPreset] = useState<DateRangePreset>("7d");
  const [filters, setFilters] = useState<ProductFilterState>(DEFAULT_PRODUCT_FILTERS);
  const [isFilterSheetOpen, setFilterSheetOpen] = useState(false);
  const { selectedDay, metric, topN, search, categoryId, sources } = filters;

  /**
   * The text box keeps `search`; the aggregation reads this.
   *
   * Every recompute walks every line item twice — once for the window on
   * screen, once for the window it is compared against — so running that on
   * the keystroke is what made typing stutter. The caret stays live because
   * the input is still bound to the raw value.
   */
  const debouncedSearch = useDebouncedValue(search);

  const updateFilters = useCallback(
    (patch: Partial<ProductFilterState>) =>
      setFilters((current) => ({ ...current, ...patch })),
    []
  );

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
        search: debouncedSearch,
        categoryId: categoryId ?? undefined,
        categoryByItemId,
        sources,
        startMs: dateWindow.startMs,
        endMs: dateWindow.endMs,
      }),
    [
      orderInputs,
      itemInputs,
      metric,
      topN,
      debouncedSearch,
      categoryId,
      categoryByItemId,
      sources,
      dateWindow,
    ]
  );

  const deltas = useMemo(() => {
    const before = previousWindow(dateWindow.startMs, dateWindow.endMs);
    const previous = buildProductAnalytics(orderInputs, itemInputs, {
      metric,
      search: debouncedSearch,
      categoryId: categoryId ?? undefined,
      categoryByItemId,
      sources,
      startMs: before.startMs,
      endMs: before.endMs,
    });
    return computeProductDeltas(daily.totals, previous.totals);
  }, [
    daily,
    orderInputs,
    itemInputs,
    metric,
    debouncedSearch,
    categoryId,
    categoryByItemId,
    sources,
    dateWindow,
  ]);

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
    setFilters((current) => ({
      ...current,
      sources: current.sources.includes(value)
        ? current.sources.filter((s) => s !== value)
        : [...current.sources, value],
    }));
  }, []);

  const categoryNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const category of categories) map[category.id] = category.name;
    return map;
  }, [categories]);

  const filterChips = useMemo(
    () =>
      buildFilterChips(filters, {
        categoryNameById,
        dayLabel: (dateKey) => formatDayLabel(dateKey, todayKey),
      }),
    [filters, categoryNameById, todayKey]
  );

  const activeFilterCount = useMemo(() => countActiveFilters(filters), [filters]);

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

  if (!hasBackend) {
    return (
      <View style={styles.screen}>
        <View style={styles.headerWrap}>
          <Text style={styles.title}>Products</Text>
        </View>
        <ErrorState message="Product analytics needs this store's order backend to be configured." />
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
        <View style={styles.modeBlock}>
          <SegmentedControl
            options={VIEW_MODES}
            value={viewMode}
            onChange={setViewMode}
            accessibilityPrefix="Show"
          />
        </View>

        {viewMode === "daily" ? (
          <>
            {/*
              The period is the only filter that stays on the screen: it is the
              one a merchant changes every session. Everything else opens from
              the Filters button and reports back as a chip, so the numbers are
              never more than a segmented control away from the top of the page.
            */}
            <SegmentedControl
              options={DATE_RANGE_PRESETS}
              value={selectedDay ? null : preset}
              onChange={(value) => {
                updateFilters({ selectedDay: null });
                setPreset(value);
              }}
              accessibilityPrefix="Show"
            />

            <View style={styles.controlRow}>
              <View style={styles.searchBox}>
                <TextInput
                  style={styles.searchInput}
                  value={search}
                  onChangeText={(value) => updateFilters({ search: value })}
                  placeholder="Search products"
                  placeholderTextColor={colors.textTertiary}
                  autoCorrect={false}
                  autoCapitalize="none"
                  returnKeyType="search"
                  // No `clearButtonMode`: it is iOS-only, so it would stack a
                  // second clear control on top of the one below on iPhone and
                  // leave Android with none.
                  accessibilityLabel="Search products by name"
                />
                {search.length > 0 && (
                  <TouchableOpacity
                    onPress={() => updateFilters({ search: "" })}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel="Clear search"
                  >
                    <Text style={styles.searchClear}>Clear</Text>
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity
                style={[styles.filterButton, activeFilterCount > 0 && styles.filterButtonActive]}
                onPress={() => setFilterSheetOpen(true)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={
                  activeFilterCount > 0
                    ? `Filters, ${activeFilterCount} active`
                    : "Filters, none active"
                }
              >
                <Text
                  style={[
                    styles.filterButtonText,
                    activeFilterCount > 0 && styles.filterButtonTextActive,
                  ]}
                >
                  Filters
                </Text>
                {activeFilterCount > 0 && (
                  <View style={styles.filterCount}>
                    <Text style={styles.filterCountText}>{activeFilterCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            <FilterChipsRow
              chips={filterChips}
              onRemove={(chip) => setFilters((current) => clearChip(current, chip))}
              onClearAll={() => setFilters((current) => clearAllFilters(current))}
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
              <EmptyState
                message={
                  activeFilterCount > 0 || search.length > 0
                    ? "No product sales matched these filters."
                    : "No product sales in this period yet."
                }
                actionLabel={
                  activeFilterCount > 0 || search.length > 0 ? "Clear filters" : undefined
                }
                onAction={
                  activeFilterCount > 0 || search.length > 0
                    ? () => setFilters(DEFAULT_PRODUCT_FILTERS)
                    : undefined
                }
              />
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

      <ProductFilterSheet
        visible={isFilterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        days={availableDays.map((day) => ({
          key: day,
          label: formatDayLabel(day, todayKey),
        }))}
        categories={categories}
        selectedDay={selectedDay}
        onSelectDay={(day) => updateFilters({ selectedDay: day })}
        categoryId={categoryId}
        onSelectCategory={(value) => updateFilters({ categoryId: value })}
        sources={sources}
        onToggleSource={toggleSource}
        metric={metric}
        onSelectMetric={(value) => updateFilters({ metric: value })}
        topN={topN}
        onSelectTopN={(value) => updateFilters({ topN: value })}
        activeCount={activeFilterCount}
        onReset={() => setFilters((current) => clearAllFilters(current))}
      />

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
  modeBlock: { marginBottom: spacing.lg },

  controlRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    height: 44,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.md,
    backgroundColor: colors.card,
  },
  searchInput: { flex: 1, ...typography.body, color: colors.textPrimary, padding: 0 },
  // Ink at 11pt: the secondary grey measures 3.7:1 on the card and this is the
  // control that undoes a search, not decoration.
  searchClear: {
    ...typography.small,
    color: colors.textPrimary,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    height: 44,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.md,
    backgroundColor: colors.card,
  },
  // A filtered view is a different view, and the button that caused it says so
  // even before the chips are read.
  filterButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterButtonText: { ...typography.caption, color: colors.textPrimary, fontWeight: "700" },
  filterButtonTextActive: { color: colors.textOnDark },
  filterCount: {
    minWidth: 20,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.full,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
  },
  filterCountText: { fontSize: 11, fontWeight: "800", color: colors.textOnDark },

  summaryCard: {
    flexDirection: "row",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginTop: spacing.lg,
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
