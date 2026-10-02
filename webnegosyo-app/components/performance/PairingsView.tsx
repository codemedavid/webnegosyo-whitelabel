import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from "react-native";

import { colors, typography, spacing, radius } from "../../theme/colors";
import { refreshWithMinSpinner } from "../../lib/query/pull-to-refresh";
import { useCategories, useProducts } from "../../lib/query/use-products";
import { useBusinessDayAnchor } from "../../lib/use-report-window";
import { resolveReportWindow } from "../../lib/report-window";
import { useSalesLines } from "../../lib/product-performance/use-sales-lines";
import { buildPairingInsights } from "../../lib/pairings";
import { useAuthStore } from "../../stores/auth-store";
import { SegmentedControl } from "../SegmentedControl";
import { LoadingState } from "../LoadingState";
import { ErrorState } from "../ErrorState";
import { EmptyState } from "../EmptyState";
import { SectionTitle } from "./parts";
import { ItemPartnersCard, PairingSummary, PairRowView } from "./pairing-rows";

type PairingPeriod = 7 | 30 | 90;
type PairingTab = "items" | "categories" | "byItem";

const PERIOD_OPTIONS: readonly { label: string; value: PairingPeriod }[] = [
  { label: "7 days", value: 7 },
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
];

const TAB_OPTIONS: readonly { label: string; value: PairingTab }[] = [
  { label: "Items", value: "items" },
  { label: "Categories", value: "categories" },
  { label: "By item", value: "byItem" },
];

/** Pairs need a month of baskets to say anything; a week is too few for most stores. */
const DEFAULT_PERIOD: PairingPeriod = 30;

/** Rows shown before "Show all". */
const COLLAPSED_ROWS = 10;

interface PairingsViewProps {
  /** The screen's mode switcher, drawn at the top of this scroll view. */
  header: React.ReactNode;
}

/**
 * What customers order together — item pairs, category pairs, and each
 * popular item's usual partners — the raw material for combos and pairings.
 */
export function PairingsView({ header }: PairingsViewProps) {
  const [period, setPeriod] = useState<PairingPeriod>(DEFAULT_PERIOD);
  const [tab, setTab] = useState<PairingTab>("items");
  const [isExpanded, setExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { anchorMs } = useBusinessDayAnchor();

  const reportWindow = useMemo(() => resolveReportWindow({ kind: "preset", days: period }, anchorMs), [period, anchorMs]);
  const sales = useSalesLines(reportWindow);

  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const products = useProducts(tenantId);
  const categories = useCategories(tenantId);

  const insights = useMemo(
    () =>
      buildPairingInsights({
        lines: sales.lines,
        catalog: (products.data ?? []).map((product) => ({
          id: product.id,
          name: product.name,
          categoryId: product.category_id || null,
        })),
        categories: (categories.data ?? []).map((category) => ({ id: category.id, name: category.name })),
      }),
    [sales.lines, products.data, categories.data]
  );

  const { refetch: refetchSales } = sales;
  const { refetch: refetchProducts } = products;
  const { refetch: refetchCategories } = categories;
  const onRefresh = useCallback(
    () => refreshWithMinSpinner([refetchSales, refetchProducts, refetchCategories], setRefreshing),
    [refetchSales, refetchProducts, refetchCategories]
  );

  const isPartial = sales.coveredFromMs > reportWindow.startMs;
  const periodLabel = PERIOD_OPTIONS.find((option) => option.value === period)?.label ?? "";

  const rowCount =
    tab === "items"
      ? insights.itemPairs.length
      : tab === "categories"
        ? insights.categoryPairs.length
        : insights.partnersByItem.length;
  const visibleCount = isExpanded ? rowCount : Math.min(rowCount, COLLAPSED_ROWS);

  const tabBody = (() => {
    if (tab === "items") {
      if (insights.itemPairs.length === 0) {
        return (
          <EmptyState
            title="No clear item pairs yet"
            message="A pair shows once two items are ordered together at least twice, and more often than chance. Try a longer period."
          />
        );
      }
      return (
        <>
          <SectionTitle title="Ordered together" detail="Strongest first" />
          <View style={styles.listCard}>
            {insights.itemPairs.slice(0, visibleCount).map((pair, index) => (
              <View key={`${pair.anchor.id}-${pair.partner.id}`} style={index > 0 ? styles.divided : undefined}>
                <PairRowView pair={pair} kind="item" />
              </View>
            ))}
          </View>
        </>
      );
    }

    if (tab === "categories") {
      if (insights.categoryPairs.length === 0) {
        return (
          <EmptyState
            title="No category pairs yet"
            message="Category pairs show once customers order from two different categories in one order."
          />
        );
      }
      return (
        <>
          <SectionTitle title="Categories ordered together" detail="Most orders first" />
          <View style={styles.listCard}>
            {insights.categoryPairs.slice(0, visibleCount).map((pair, index) => (
              <View key={`${pair.anchor.id}-${pair.partner.id}`} style={index > 0 ? styles.divided : undefined}>
                <PairRowView pair={pair} kind="category" />
              </View>
            ))}
          </View>
        </>
      );
    }

    if (insights.partnersByItem.length === 0) {
      return (
        <EmptyState
          title="No partners yet"
          message="Your best sellers will list what customers usually add with them once they are ordered alongside other items."
        />
      );
    }
    return (
      <>
        <SectionTitle title="What goes with your best sellers" detail="Share of that item's orders" />
        <View style={styles.listCard}>
          {insights.partnersByItem.slice(0, visibleCount).map((entry, index) => (
            <View key={entry.item.id} style={index > 0 ? styles.divided : undefined}>
              <ItemPartnersCard entry={entry} />
            </View>
          ))}
        </View>
      </>
    );
  })();

  const body = (() => {
    if (sales.isMissingFunction) {
      return <ErrorState message="This store needs a backend update to show what customers order together." />;
    }
    if (sales.error) return <ErrorState message={sales.error} />;
    if (sales.isLoading) return <LoadingState message="Reading your orders…" />;
    if (insights.orderCount === 0) {
      return (
        <EmptyState
          title="No orders in this period"
          message="Once customers order, the items and categories they buy together show up here."
        />
      );
    }

    return (
      <>
        <PairingSummary
          eyebrow={`Baskets · ${periodLabel}`}
          multiItemShare={insights.multiItemShare}
          orderCount={insights.orderCount}
          multiItemOrders={insights.multiItemOrders}
          avgItemsPerOrder={insights.avgItemsPerOrder}
          partialNote={
            isPartial
              ? "Too many orders to read at once — showing the most recent part of this period."
              : null
          }
        />

        <View style={styles.tabs}>
          <SegmentedControl
            options={TAB_OPTIONS}
            value={tab}
            onChange={(value) => {
              setTab(value);
              setExpanded(false);
            }}
            accessibilityPrefix="Show pairs by"
          />
        </View>

        {tabBody}

        {rowCount > COLLAPSED_ROWS && (
          <TouchableOpacity
            style={styles.showAll}
            onPress={() => setExpanded((current) => !current)}
            accessibilityRole="button"
          >
            <Text style={styles.showAllText}>{isExpanded ? `Show top ${COLLAPSED_ROWS}` : `Show all ${rowCount}`}</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.footnote}>
          Counted per order: two of the same item in one order count once. Combo idea — the
          second item is in 60% or more of the first item&apos;s orders, so a bundle price is likely
          to sell. Pairing idea — 30% or more, worth suggesting right after the first is added.
          Set both up in Boost Sales on the web dashboard.
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
          value={period}
          onChange={(value) => {
            setPeriod(value);
            setExpanded(false);
          }}
          accessibilityPrefix="Show"
        />
      </View>
      {body}
    </ScrollView>
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
