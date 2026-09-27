import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from "react-native";

import { colors, typography, spacing, radius } from "../../theme/colors";
import { formatCount, formatPeso } from "../../lib/format";
import { refreshWithMinSpinner } from "../../lib/query/pull-to-refresh";
import { useBusinessDayAnchor } from "../../lib/use-report-window";
import { buildStorePerformance } from "../../lib/product-performance/aggregate";
import {
  DEFAULT_PERFORMANCE_PERIOD,
  PERFORMANCE_PERIODS,
  resolvePerformancePeriod,
  type PerformancePeriodKey,
} from "../../lib/product-performance/period";
import { usePerformanceCatalog, useSalesLines } from "../../lib/product-performance/use-sales-lines";
import { SegmentedControl } from "../SegmentedControl";
import { LoadingState } from "../LoadingState";
import { ErrorState } from "../ErrorState";
import { EmptyState } from "../EmptyState";
import { EstimateNote } from "./breakdowns";
import { PerformanceHero, SectionTitle } from "./parts";
import { ProductRankRow, StoreAddonRow } from "./rows";

type ListTab = "items" | "addons";

const LIST_TABS: readonly { label: string; value: ListTab }[] = [
  { label: "Items", value: "items" },
  { label: "Add-ons", value: "addons" },
];

const PERIOD_OPTIONS = PERFORMANCE_PERIODS.map((period) => ({ label: period.label, value: period.key }));

/** Rows shown before "Show all" — a top ten reads; a menu of ninety scrolls. */
const COLLAPSED_ROWS = 10;

/**
 * A comparison doubles the read. Past a week that is a month of lines for a
 * store-wide list, so the long period shows the month on its own and each
 * product's page still compares.
 */
const MAX_COMPARED_DAYS = 7;

interface ProductsPerformanceViewProps {
  /** The screen's mode switcher, drawn at the top of this scroll view. */
  header: React.ReactNode;
  onOpenProduct: (menuItemId: string, period: PerformancePeriodKey) => void;
}

/**
 * Which products sell, which variations people pick, and which add-ons ride
 * along — for today, yesterday, a week or a month.
 */
export function ProductsPerformanceView({ header, onOpenProduct }: ProductsPerformanceViewProps) {
  const [periodKey, setPeriodKey] = useState<PerformancePeriodKey>(DEFAULT_PERFORMANCE_PERIOD);
  const [listTab, setListTab] = useState<ListTab>("items");
  const [isExpanded, setExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { anchorMs } = useBusinessDayAnchor();

  const period = useMemo(() => resolvePerformancePeriod(periodKey, anchorMs), [periodKey, anchorMs]);
  const wantsComparison = period.dayCount <= MAX_COMPARED_DAYS;
  const request = useMemo(
    () => ({
      startMs: wantsComparison ? period.previous.startMs : period.window.startMs,
      endMs: period.window.endMs,
    }),
    [wantsComparison, period]
  );

  const sales = useSalesLines(request);
  const catalog = usePerformanceCatalog();

  const isPartial = sales.coveredFromMs > period.window.startMs;
  const canCompare = wantsComparison && sales.coveredFromMs <= period.previous.startMs;

  const store = useMemo(
    () =>
      buildStorePerformance({
        lines: sales.lines,
        catalog,
        window: period.window,
        previous: canCompare ? period.previous : null,
      }),
    [sales.lines, catalog, period, canCompare]
  );

  const { refetch } = sales;
  const onRefresh = useCallback(() => refreshWithMinSpinner([refetch], setRefreshing), [refetch]);

  const changePeriod = (key: PerformancePeriodKey) => {
    setPeriodKey(key);
    setExpanded(false);
  };

  const leaderSales = store.products[0]?.sales ?? 0;
  const visibleProducts = isExpanded ? store.products : store.products.slice(0, COLLAPSED_ROWS);
  const visibleAddons = isExpanded ? store.addons : store.addons.slice(0, COLLAPSED_ROWS);
  const hiddenCount =
    (listTab === "items" ? store.products.length : store.addons.length) - COLLAPSED_ROWS;

  const addonValue = store.totals.addonRevenue > 0
    ? `${store.totals.addonRevenueIsEstimate ? "≈" : ""}${formatPeso(store.totals.addonRevenue, 0)}`
    : formatCount(store.totals.addonUnits);

  const body = (() => {
    if (sales.isMissingFunction) {
      return <ErrorState message="This store needs a backend update to show product performance." />;
    }
    if (sales.error) return <ErrorState message={sales.error} />;
    if (sales.isLoading) return <LoadingState message="Adding up your sales…" />;
    if (store.isEmpty) {
      return (
        <EmptyState
          title={periodKey === "today" ? "No sales yet today" : "No sales in this period"}
          message="Every item sold — with its variations and add-ons — shows up here."
        />
      );
    }

    return (
      <>
        <PerformanceHero
          eyebrow={`Item sales · ${period.label}`}
          sales={store.totals.sales}
          change={store.salesChange}
          comparisonLabel={period.comparisonLabel}
          partialNote={
            isPartial
              ? "Too many sales to read at once — showing the most recent part of this period."
              : wantsComparison
                ? null
                : "Open a product to compare it with the 30 days before."
          }
          daily={period.dayCount > 1 ? sumDaily(store.products) : []}
          stats={[
            { label: "Items sold", value: formatCount(store.totals.units) },
            { label: "Orders", value: formatCount(store.totals.orders) },
            { label: store.totals.addonRevenue > 0 ? "From add-ons" : "Add-ons", value: addonValue },
          ]}
        />

        <View style={styles.tabs}>
          <SegmentedControl
            options={LIST_TABS}
            value={listTab}
            onChange={(value) => {
              setListTab(value);
              setExpanded(false);
            }}
            accessibilityPrefix="Rank"
          />
        </View>

        {listTab === "items" ? (
          <>
            <SectionTitle title="Best sellers" detail="Tap an item for its variations and add-ons" />
            <View style={styles.listCard}>
              {visibleProducts.map((product, index) => (
                <View key={product.menuItemId} style={index > 0 ? styles.divided : undefined}>
                  <ProductRankRow
                    rank={index + 1}
                    product={product}
                    leaderSales={leaderSales}
                    showChange={canCompare}
                    onPress={() => onOpenProduct(product.menuItemId, periodKey)}
                  />
                </View>
              ))}
            </View>
          </>
        ) : store.addons.length === 0 ? (
          <EmptyState title="No add-ons sold" message="Add-ons customers pick with an item will be ranked here." />
        ) : (
          <>
            <SectionTitle title="Top add-ons" detail={`${formatCount(store.totals.addonUnits)} sold`} />
            <View style={styles.listCard}>
              {visibleAddons.map((addon, index) => (
                <View key={addon.name} style={index > 0 ? styles.divided : undefined}>
                  <StoreAddonRow rank={index + 1} addon={addon} />
                </View>
              ))}
            </View>
            {store.totals.addonRevenueIsEstimate && <EstimateNote />}
          </>
        )}

        {hiddenCount > 0 && (
          <TouchableOpacity
            style={styles.showAll}
            onPress={() => setExpanded((current) => !current)}
            accessibilityRole="button"
          >
            <Text style={styles.showAllText}>{isExpanded ? "Show top 10" : `Show all ${hiddenCount + COLLAPSED_ROWS}`}</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.footnote}>
          Item sales are what each dish took, variations and add-ons included, before order
          discounts, service charge and delivery — so they run a little under the revenue on
          Home and Analytics, which count whole orders.
        </Text>
      </>
    );
  })();

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {header}
      <View style={styles.periods}>
        <SegmentedControl
          options={PERIOD_OPTIONS}
          value={periodKey}
          onChange={changePeriod}
          accessibilityPrefix="Show"
        />
      </View>
      {body}
    </ScrollView>
  );
}

/** The store's daily item sales, from the per-product series. */
function sumDaily(products: readonly { daily: readonly number[] }[]): number[] {
  const days = products[0]?.daily.length ?? 0;
  return Array.from({ length: days }, (_, day) =>
    products.reduce((sum, product) => sum + (product.daily[day] ?? 0), 0)
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, paddingBottom: spacing.xxl * 3 },
  periods: { marginBottom: spacing.lg },
  tabs: { marginTop: spacing.xl },
  listCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.separator,
    overflow: "hidden",
  },
  divided: { borderTopWidth: 1, borderTopColor: colors.separator },
  showAll: {
    alignSelf: "center",
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  showAllText: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
  footnote: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: spacing.xl,
    lineHeight: 16,
  },
});
