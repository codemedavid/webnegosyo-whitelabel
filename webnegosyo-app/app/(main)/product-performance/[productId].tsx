import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { colors, typography, spacing } from "../../../theme/colors";
import { formatCount, formatPeso } from "../../../lib/format";
import { refreshWithMinSpinner } from "../../../lib/query/pull-to-refresh";
import { useBusinessDayAnchor } from "../../../lib/use-report-window";
import { buildProductPerformance } from "../../../lib/product-performance/aggregate";
import { buildProductInsights } from "../../../lib/product-performance/insights";
import {
  DEFAULT_PERFORMANCE_PERIOD,
  PERFORMANCE_PERIODS,
  isPerformancePeriod,
  resolvePerformancePeriod,
  type PerformancePeriodKey,
} from "../../../lib/product-performance/period";
import { usePerformanceCatalog, useSalesLines } from "../../../lib/product-performance/use-sales-lines";
import { goTo } from "../../../lib/tab-navigation";
import { BackHeader } from "../../../components/BackHeader";
import { SegmentedControl } from "../../../components/SegmentedControl";
import { LoadingState } from "../../../components/LoadingState";
import { ErrorState } from "../../../components/ErrorState";
import { EmptyState } from "../../../components/EmptyState";
import { InsightList, PerformanceHero, SectionTitle } from "../../../components/performance/parts";
import { AddonList, VariationMixCard } from "../../../components/performance/breakdowns";

const PERIOD_OPTIONS = PERFORMANCE_PERIODS.map((period) => ({ label: period.label, value: period.key }));

const EMPTY_TITLES: Record<PerformancePeriodKey, string> = {
  today: "Not sold yet today",
  yesterday: "No sales yesterday",
  "7d": "No sales in the last 7 days",
  "30d": "No sales in the last 30 days",
};

/**
 * One product's performance: how much it took, which variations people pick,
 * and which add-ons they put on it — for the period chosen on the list, and
 * switchable here.
 */
export default function ProductPerformanceScreen() {
  const params = useLocalSearchParams<{ productId: string; period?: string }>();
  const productId = params.productId ?? "";
  const [periodKey, setPeriodKey] = useState<PerformancePeriodKey>(() =>
    isPerformancePeriod(params.period) ? params.period : DEFAULT_PERFORMANCE_PERIOD
  );
  const [refreshing, setRefreshing] = useState(false);
  const { anchorMs } = useBusinessDayAnchor();

  // This screen is a tab route that stays mounted, so opening another product
  // (or the same one from a different period) arrives as new params on the
  // same instance — the period it was opened with must win again.
  const requestedPeriod = params.period;
  useEffect(() => {
    if (isPerformancePeriod(requestedPeriod)) setPeriodKey(requestedPeriod);
  }, [requestedPeriod, productId]);

  const period = useMemo(() => resolvePerformancePeriod(periodKey, anchorMs), [periodKey, anchorMs]);
  // One product's lines are few, so its page always reads the comparison too.
  const request = useMemo(
    () => (productId ? { startMs: period.previous.startMs, endMs: period.window.endMs, menuItemId: productId } : null),
    [productId, period]
  );
  const sales = useSalesLines(request);
  const catalog = usePerformanceCatalog();

  const isPartial = sales.coveredFromMs > period.window.startMs;
  const canCompare = sales.coveredFromMs <= period.previous.startMs;

  const product = useMemo(
    () =>
      buildProductPerformance({
        lines: sales.lines,
        catalog,
        menuItemId: productId,
        window: period.window,
        previous: canCompare ? period.previous : null,
      }),
    [sales.lines, catalog, productId, period, canCompare]
  );
  const insights = useMemo(() => buildProductInsights(product), [product]);

  const { refetch } = sales;
  const onRefresh = useCallback(() => refreshWithMinSpinner([refetch], setRefreshing), [refetch]);

  const title = catalog.get(productId)?.name ?? product.name;
  const hasOptions = product.variationGroups.length > 0 || product.addons.length > 0;

  const content = (() => {
    if (sales.isMissingFunction) {
      return <ErrorState message="This store needs a backend update to show product performance." />;
    }
    if (sales.error) return <ErrorState message={sales.error} />;
    if (sales.isLoading) return <LoadingState message="Adding up this item…" />;
    if (product.units === 0) {
      return (
        <EmptyState
          title={EMPTY_TITLES[periodKey]}
          message="Try a longer period to see how this item usually does."
        />
      );
    }

    return (
      <>
        <PerformanceHero
          eyebrow={`Sales · ${period.label}`}
          sales={product.sales}
          change={product.salesChange}
          comparisonLabel={period.comparisonLabel}
          partialNote={isPartial ? "Showing the most recent part of this period — there were too many sales to read at once." : null}
          daily={period.dayCount > 1 ? product.daily.map((point) => point.sales) : []}
          stats={[
            { label: "Sold", value: formatCount(product.units) },
            { label: "Orders", value: formatCount(product.orders) },
            { label: "Avg price", value: formatPeso(product.avgPrice, 0) },
          ]}
        />

        {insights.length > 0 && (
          <>
            <SectionTitle title="At a glance" />
            <InsightList insights={insights} />
          </>
        )}

        {product.variationGroups.length > 0 && (
          <>
            <SectionTitle title="What people pick" />
            {product.variationGroups.map((group) => (
              <VariationMixCard key={group.groupName} group={group} productUnits={product.units} />
            ))}
          </>
        )}

        {product.addons.length > 0 && (
          <>
            <SectionTitle
              title="Add-ons"
              detail={`${product.addonRevenueIsEstimate ? "≈ " : ""}${formatPeso(product.addonRevenue, 0)} extra`}
            />
            <AddonList addons={product.addons} />
          </>
        )}

        {!hasOptions && (
          <Text style={styles.plainNote}>
            This item was sold without variations or add-ons in this period.
          </Text>
        )}
      </>
    );
  })();

  return (
    <View style={styles.screen}>
      <BackHeader
        title={title || "Product"}
        subtitle="Performance"
        onBack={() => goTo(router, "/(main)/product-analytics")}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <View style={styles.periods}>
          <SegmentedControl
            options={PERIOD_OPTIONS}
            value={periodKey}
            onChange={setPeriodKey}
            accessibilityPrefix="Show"
          />
        </View>
        {content}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl * 3 },
  periods: { marginBottom: spacing.lg },
  plainNote: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xl, textAlign: "center" },
});
