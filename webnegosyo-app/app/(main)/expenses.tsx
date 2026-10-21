import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, RefreshControl, ScrollView, SectionList, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { useBranchContextStore } from "../../stores/branch-context-store";
import { AddExpenseSheet } from "../../components/expenses/AddExpenseSheet";
import { SortPayoutsSheet } from "../../components/expenses/SortPayoutsSheet";
import { CategoryFilterSheet } from "../../components/expenses/home/CategoryFilterSheet";
import { CategoryBreakdown } from "../../components/expenses/home/CategoryBreakdown";
import { DayCard, DayHeader } from "../../components/expenses/home/ExpenseDay";
import { ExportExpensesSheet } from "../../components/expenses/home/ExportExpensesSheet";
import { AddExpenseFab, HomeSearchField, HomeSkeleton, QuietBanner } from "../../components/expenses/home/HomeBits";
import { HomeFilterPills } from "../../components/expenses/home/HomeFilterPills";
import { HomeHero, ModeSwitch, SideBreakdown, type HomeMode } from "../../components/expenses/home/HomeSummary";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { IconButton } from "../../components/IconButton";
import { ScreenHeader } from "../../components/ScreenHeader";
import { useIsWideReports } from "../../components/reports/ReportsColumns";
import { shortCategoryName } from "../../lib/expenses/category-look";
import { monthLabel, monthOf, shiftMonth } from "../../lib/expenses/expense-format";
import {
  hasHomeParams,
  homeSubtitle,
  parseHomeParams,
  rangeLabel,
  windowMonth,
  type DayRange,
  type HomeView,
} from "../../lib/expenses/expenses-home";
import { useExpenseBranchLabel, useExpenseWindow, useKeptFigure } from "../../lib/expenses/expenses-home-data";
import { buildHomeModel } from "../../lib/expenses/expenses-home-model";
import type { NeedsYouItem } from "../../lib/expenses/expenses-home-needs";
import { NO_HOME_FILTERS, type HomeDay, type HomeFilters, type HomeRow } from "../../lib/expenses/expenses-home-rows";
import { dismissQueuedExpense, retryQueuedExpenses } from "../../lib/expenses/live-expense-queue";
import {
  useDeviceExpenseQueue,
  useExpenseCategories,
  useExpenseTenant,
  useInvalidateExpenses,
  useRecentExpenses,
  useUnsortedPayouts,
} from "../../lib/expenses/use-expenses";
import { refreshWithMinSpinner } from "../../lib/query/pull-to-refresh";
import { colors, spacing } from "../../theme/colors";

type Sheet =
  | { kind: "add"; categoryId: string | null }
  | { kind: "sort" }
  | { kind: "category" }
  | { kind: "export" }
  | null;

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CLEARED_PARAMS = { add: undefined, category: undefined, month: undefined, view: undefined, from: undefined, to: undefined };

/**
 * The expense book (design brief §1): what the store spent in a month (or the
 * exact days Profit linked to), how it split, what needs the owner, and every
 * expense by day. The hero and the split follow the filters and search, so the
 * number always matches the list. Reached from Reports, under Money; gated on
 * the `expenses` key (cashiers pay from the drawer and never land here).
 */
export default function ExpensesScreen() {
  const tenantId = useExpenseTenant();
  const invalidate = useInvalidateExpenses();
  const isWide = useIsWideReports();
  const params = useLocalSearchParams<{ add?: string; category?: string; month?: string; view?: string; from?: string; to?: string }>();
  const selectedOutlet = useBranchContextStore((s) => s.selectedOutletId);

  const [month, setMonth] = useState(() => monthOf(Date.now()));
  const [range, setRange] = useState<DayRange | null>(null);
  const [filters, setFilters] = useState<HomeFilters>(NO_HOME_FILTERS);
  const [mode, setMode] = useState<HomeMode>("list");
  const [isSearching, setIsSearching] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Home, Profit and the drawer land here with something to show or open.
  const { add, category, month: monthParam, view, from, to } = params;
  useEffect(() => {
    const raw = { add, category, month: monthParam, view, from, to };
    if (!hasHomeParams(raw)) return;
    const asked = parseHomeParams(raw, Date.now());
    if (asked.range) {
      setRange(asked.range);
      setMonth(monthOf(asked.range.to));
    } else if (asked.month) {
      setRange(null);
      setMonth(asked.month);
    }
    if (asked.isAdd) setSheet({ kind: "add", categoryId: asked.categoryId });
    else if (asked.isSort) setSheet({ kind: "sort" });
    if (asked.view || (asked.categoryId && !asked.isAdd)) {
      setFilters({ ...NO_HOME_FILTERS, view: asked.view ?? "all", categoryId: asked.isAdd ? null : asked.categoryId });
      setMode("list");
    }
    router.setParams(CLEARED_PARAMS);
  }, [add, category, monthParam, view, from, to]);

  const data = useExpenseWindow(month, range, selectedOutlet ?? undefined);
  const { categories } = useExpenseCategories();
  const { expenses: recent } = useRecentExpenses(sheet?.kind === "sort");
  const queue = useDeviceExpenseQueue();
  const unsorted = useUnsortedPayouts(true);
  const kept = useKeptFigure(month, range);
  const branchLabel = useExpenseBranchLabel();

  const unsortedCents = useMemo(() => unsorted.payouts.reduce((sum, payout) => sum + payout.amountCents, 0), [unsorted.payouts]);
  const model = useMemo(
    () =>
      buildHomeModel({
        month,
        range,
        filters,
        expenses: data.expenses,
        previous: data.previous,
        categories,
        queued: queue.expenses,
        waitingReceipts: queue.waitingReceipts,
        unsortedCount: unsorted.payouts.length,
        unsortedCents,
        nowMs: Date.now(),
      }),
    [month, range, filters, data.expenses, data.previous, categories, queue, unsorted.payouts.length, unsortedCents],
  );

  const nowMs = Date.now();
  const baseMonth = windowMonth(month, range);
  const canGoNext = baseMonth < monthOf(nowMs);
  const windowWords = range ? rangeLabel(range, nowMs) : monthLabel(month, nowMs);
  const categoryName = filters.categoryId ? categories.find((category) => category.id === filters.categoryId)?.name ?? "Category" : null;
  const clearLabel = model.isFiltered ? "Clear filters" : range ? `Show all of ${monthLabel(baseMonth, nowMs)}` : null;

  const stepMonth = (delta: number) => {
    setRange(null);
    setMonth(shiftMonth(baseMonth, delta));
  };
  const clearAll = () => {
    setFilters(NO_HOME_FILTERS);
    if (!model.isFiltered && range) stepMonth(0);
  };
  const showView = (view: HomeView) => {
    setFilters((current) => ({ ...current, view }));
    setMode("list");
  };
  const showCategory = (categoryId: string | null) => {
    setFilters((current) => ({ ...current, categoryId }));
    setMode("list");
    setSheet(null);
  };
  const onNeed = (item: NeedsYouItem) => {
    if (item.action.kind === "sort") setSheet({ kind: "sort" });
    else showView(item.action.view);
  };
  const toggleSearch = () => {
    if (isSearching) setFilters((current) => ({ ...current, search: "" }));
    setIsSearching(!isSearching);
  };

  const reloadAll = useCallback(() => {
    void invalidate();
  }, [invalidate]);

  const refresh = useCallback(
    () =>
      refreshWithMinSpinner(
        [
          data.refetch,
          unsorted.refetch,
          async () => {
            if (tenantId) await retryQueuedExpenses(tenantId);
          },
        ],
        setIsRefreshing,
      ),
    [data.refetch, unsorted.refetch, tenantId],
  );

  const openRow = useCallback(
    (row: HomeRow) => {
      if (row.expenseId) {
        router.push(`/(main)/expense/${row.expenseId}` as never);
        return;
      }
      if (!row.queuedId || !tenantId) return;
      const queuedId = row.queuedId;
      if (row.refusedReason) {
        Alert.alert("Not sent", row.refusedReason, [
          { text: "Keep it", style: "cancel" },
          { text: "Remove from this phone", style: "destructive", onPress: () => void dismissQueuedExpense(queuedId) },
        ]);
        return;
      }
      Alert.alert("Waiting to send", "This expense is saved on this phone and will be sent when the connection is back.", [
        { text: "OK", style: "cancel" },
        { text: "Try now", onPress: () => void retryQueuedExpenses(tenantId).then(reloadAll) },
      ]);
    },
    [tenantId, reloadAll],
  );

  const header = (
    <ScreenHeader
      title="Expenses"
      subtitle={homeSubtitle({ month, range, branchLabel }, nowMs)}
      actions={
        <>
          <IconButton icon={isSearching ? "close" : "search"} label={isSearching ? "Close search" : "Search expenses"} onPress={toggleSearch} />
          <IconButton icon="export" label={`Export ${windowWords}`} onPress={() => setSheet({ kind: "export" })} />
        </>
      }
    >
      {isSearching ? <HomeSearchField value={filters.search} onChange={(search) => setFilters((current) => ({ ...current, search }))} /> : null}
    </ScreenHeader>
  );

  const hero = (
    <HomeHero
      model={model}
      monthShort={SHORT_MONTHS[Number(baseMonth.slice(5, 7)) - 1] ?? ""}
      clearLabel={clearLabel}
      onClear={clearAll}
      kept={kept}
      onOpenProfit={() => router.push("/(main)/profit" as never)}
      isTruncated={data.isTruncated}
      canGoNext={canGoNext}
      onPrevious={() => stepMonth(-1)}
      onNext={() => stepMonth(1)}
      onNeed={onNeed}
    />
  );
  const banner =
    data.error && data.hasData ? (
      <QuietBanner message="Could not refresh. Showing what was loaded before." onRetry={() => void data.refetch()} />
    ) : null;
  const pills = (
    <HomeFilterPills
      view={filters.view}
      checkCount={model.counts.check}
      categoryLabel={categoryName ? shortCategoryName(categoryName) : null}
      onView={showView}
      onCategory={() => setSheet({ kind: "category" })}
    />
  );
  const isListMode = isWide || mode === "list";
  const listHeader = (
    <View style={styles.listHeader}>
      {banner}
      {isWide ? null : hero}
      {isWide ? null : <ModeSwitch mode={mode} onMode={setMode} />}
      {isListMode ? pills : <CategoryBreakdown lines={model.breakdown} onPick={showCategory} />}
    </View>
  );
  const emptyList = model.rows.length === 0 ? (
    <EmptyState
      icon="receipt"
      title={`Nothing recorded for ${windowWords}`}
      message="When the store pays for something, like ice, LPG, rent or sahod, add it here."
      actionLabel="Add expense"
      onAction={() => setSheet({ kind: "add", categoryId: null })}
      inset
    />
  ) : (
    <EmptyState icon="search" title="Nothing matches" message="No expense here fits these filters." actionLabel="Clear filters" onAction={clearAll} inset />
  );

  const list = (
    <SectionList
      sections={isListMode ? model.days.map((day) => ({ key: day.date, day, data: [day] })) : []}
      keyExtractor={(day: HomeDay) => day.date}
      renderItem={({ item }) => <DayCard day={item} onOpen={openRow} />}
      renderSectionHeader={({ section }) => <DayHeader title={section.day.title} totalCents={section.day.totalCents} />}
      stickySectionHeadersEnabled
      ListHeaderComponent={listHeader}
      ListEmptyComponent={isListMode ? emptyList : null}
      contentContainerStyle={[styles.list, isWide && styles.listWide]}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
      keyboardShouldPersistTaps="handled"
      initialNumToRender={6}
      windowSize={7}
    />
  );

  const isFirstLoad = data.isLoading && !data.hasData;
  const hasFailed = data.error !== null && !data.hasData;
  const body = isFirstLoad ? (
    <HomeSkeleton />
  ) : hasFailed ? (
    <ErrorState title="Expenses could not load" message={data.error ?? undefined} onRetry={() => void data.refetch()} />
  ) : isWide ? (
    <View style={styles.columns}>
      <View style={styles.main}>{list}</View>
      <ScrollView style={styles.side} contentContainerStyle={styles.sideBody}>
        {hero}
        <SideBreakdown model={model} onPick={showCategory} />
      </ScrollView>
    </View>
  ) : (
    list
  );

  return (
    <View style={styles.screen}>
      {header}
      {body}
      {hasFailed ? null : <AddExpenseFab onPress={() => setSheet({ kind: "add", categoryId: null })} />}

      {sheet?.kind === "add" ? (
        <AddExpenseSheet visible mode={{ kind: "book" }} initialCategoryId={sheet.categoryId} onClose={() => setSheet(null)} onCommitted={reloadAll} />
      ) : null}
      {sheet?.kind === "sort" ? (
        <SortPayoutsSheet payouts={unsorted.payouts} categories={categories} recent={recent} onClose={() => setSheet(null)} onSorted={reloadAll} />
      ) : null}
      {sheet?.kind === "category" ? (
        <CategoryFilterSheet categories={categories} selectedId={filters.categoryId} onPick={showCategory} onClose={() => setSheet(null)} />
      ) : null}
      {sheet?.kind === "export" ? (
        <ExportExpensesSheet
          label={windowWords}
          expenses={data.expenses}
          categories={categories}
          window={model.window}
          isTruncated={data.isTruncated}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { paddingHorizontal: spacing.xl, paddingBottom: 120 },
  listWide: { paddingRight: 0 },
  listHeader: { gap: spacing.md },
  columns: { flex: 1, flexDirection: "row", gap: spacing.xl },
  main: { flex: 3 },
  side: { flex: 2 },
  sideBody: { paddingRight: spacing.xl, paddingBottom: 120 },
});
