import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, RefreshControl, ScrollView, SectionList, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { useBranchContextStore } from "../../stores/branch-context-store";
import { AddExpenseSheet } from "../../components/expenses/AddExpenseSheet";
import { NewExpenseSheet } from "../../components/expenses/NewExpenseSheet";
import { SortPayoutsSheet } from "../../components/expenses/SortPayoutsSheet";
import { BillsCard, BillsDoor } from "../../components/expenses/home/BillsCard";
import { CategoryFilterSheet } from "../../components/expenses/home/CategoryFilterSheet";
import { CategoryBreakdown } from "../../components/expenses/home/CategoryBreakdown";
import { DayCard, DayHeader } from "../../components/expenses/home/ExpenseDay";
import { ExportExpensesSheet } from "../../components/expenses/home/ExportExpensesSheet";
import { AddExpenseFab, HomeSearchField, HomeSkeleton, QuietBanner } from "../../components/expenses/home/HomeBits";
import { HomeFilterPills } from "../../components/expenses/home/HomeFilterPills";
import { HomeHero, ModeSwitch, SideBreakdown, type HomeMode } from "../../components/expenses/home/HomeSummary";
import type { HeroState } from "../../components/expenses/home/ExpensesHero";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { IconButton } from "../../components/IconButton";
import { ScreenHeader } from "../../components/ScreenHeader";
import { useIsWideReports } from "../../components/reports/ReportsColumns";
import { BILLS_PATH, billHref, makeBillHref, makeBillTarget } from "../../lib/expenses/bills-route";
import {
  buildBillsView,
  payContextFor,
  stillToPayLine,
  targetDueOn,
  type BillPayContext,
  type BillRowModel,
} from "../../lib/expenses/bills-screen";
import { shortCategoryName } from "../../lib/expenses/category-look";
import { monthLabel, monthOf, shiftMonth } from "../../lib/expenses/expense-format";
import {
  hasHomeParams,
  homeStateForLink,
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
import {
  NO_HOME_FILTERS,
  knownCategoryFilters,
  type HomeDay,
  type HomeFilters,
  type HomeRow,
} from "../../lib/expenses/expenses-home-rows";
import { dismissQueuedExpense, retryQueuedExpenses } from "../../lib/expenses/live-expense-queue";
import { useBillSuggestion } from "../../lib/expenses/use-bill-suggestion";
import { useBillBoard } from "../../lib/expenses/use-bills";
import {
  useCanManageExpenses,
  useCategoryIndex,
  useDeviceExpenseQueue,
  useExpenseCategories,
  useExpenseTenant,
  useInvalidateExpenses,
  useRecentExpenses,
  useUnsortedPayouts,
} from "../../lib/expenses/use-expenses";
import { refreshWithMinSpinner } from "../../lib/query/pull-to-refresh";
import { useOutlets } from "../../lib/use-outlets";
import { colors, spacing } from "../../theme/colors";

type Sheet =
  | { kind: "add"; categoryId: string | null }
  | { kind: "sort" }
  | { kind: "category" }
  | { kind: "export" }
  | { kind: "pay"; context: BillPayContext }
  | null;

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CLEARED_PARAMS = { add: undefined, category: undefined, month: undefined, view: undefined, from: undefined, to: undefined };

/**
 * The expense book (design brief §1): what the store spent in a month (or the
 * exact days Profit linked to), how it split, what needs the owner, and every
 * expense by day. The hero and the split follow the filters and search, so the
 * number always matches the list. Reached from Reports, under Money, and by
 * links (the assistant, Activity), so it checks the `expenses` key itself:
 * cashiers pay from the drawer and see a locked screen here.
 */
export default function ExpensesScreen() {
  const canManage = useCanManageExpenses();
  return canManage ? <ExpenseBook /> : <LockedExpenses />;
}

function LockedExpenses() {
  return (
    <View style={styles.screen}>
      <ScreenHeader title="Expenses" />
      <View style={styles.inset}>
        <EmptyState
          icon="lock"
          title="Expenses are locked"
          message="Ask the owner to turn on Expenses for your account. You can still pay from your drawer on the register."
          inset
        />
      </View>
    </View>
  );
}

function ExpenseBook() {
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

  // Home, Profit, the drawer and the assistant land here with something to show
  // or open. A link starts from a clean slate, so the hero is the figure tapped.
  const { add, category, month: monthParam, view, from, to } = params;
  useEffect(() => {
    const raw = { add, category, month: monthParam, view, from, to };
    if (!hasHomeParams(raw)) return;
    const nowMs = Date.now();
    const linked = homeStateForLink(parseHomeParams(raw, nowMs), nowMs);
    setRange(linked.range);
    setMonth(linked.month);
    setFilters({ ...NO_HOME_FILTERS, view: linked.view, categoryId: linked.categoryId });
    setMode("list");
    setIsSearching(false);
    if (linked.opens === "add") setSheet({ kind: "add", categoryId: linked.addCategoryId });
    else if (linked.opens === "sort") setSheet({ kind: "sort" });
    router.setParams(CLEARED_PARAMS);
  }, [add, category, monthParam, view, from, to]);

  const data = useExpenseWindow(month, range, selectedOutlet ?? undefined);
  const isReady = data.hasData;
  const hasFailed = data.error !== null && !isReady;
  const heroState: HeroState = isReady ? "ready" : hasFailed ? "failed" : "loading";
  const { categories } = useExpenseCategories();
  const { expenses: recent } = useRecentExpenses(sheet?.kind === "sort");
  const queue = useDeviceExpenseQueue();
  const unsorted = useUnsortedPayouts(true);
  const kept = useKeptFigure(month, range);
  const branchLabel = useExpenseBranchLabel();
  const categoryIndex = useCategoryIndex(categories);
  // "Make it a bill?" in Needs you (this screen only renders for accounts that manage expenses).
  const idea = useBillSuggestion(true, selectedOutlet ?? undefined);
  const bills = useBillBoard(selectedOutlet ?? undefined);
  const { outlets } = useOutlets();
  const billsView = useMemo(
    () => buildBillsView({ bills: bills.board.bills, payments: bills.board.payments, marks: bills.board.marks, today: bills.today }),
    [bills.board, bills.today],
  );

  const unsortedCents = useMemo(() => unsorted.payouts.reduce((sum, payout) => sum + payout.amountCents, 0), [unsorted.payouts]);
  // A link to a category this store does not have is ignored, never a pill reading just "Category".
  const shown = useMemo(() => knownCategoryFilters(filters, categories), [filters, categories]);
  const branchId = selectedOutlet ?? undefined;
  const model = useMemo(
    () =>
      buildHomeModel({
        month,
        range,
        filters: shown,
        expenses: data.expenses,
        previous: data.previous,
        categories,
        queued: queue.expenses,
        waitingReceipts: queue.waitingReceipts,
        unsortedCount: unsorted.payouts.length,
        unsortedCents,
        nowMs: Date.now(),
        branchId,
        billSuggestion: idea.suggestion,
      }),
    [month, range, shown, data.expenses, data.previous, categories, queue, unsorted.payouts.length, unsortedCents, branchId, idea.suggestion],
  );

  const nowMs = Date.now();
  const baseMonth = windowMonth(month, range);
  const canGoNext = baseMonth < monthOf(nowMs);
  const windowWords = range ? rangeLabel(range, nowMs) : monthLabel(month, nowMs);
  const categoryName = shown.categoryId ? categories.find((category) => category.id === shown.categoryId)?.name ?? null : null;
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
    const { action } = item;
    // "Make it a bill?" opens the add-bill sheet pre-filled (values re-checked in bills-route).
    if (action.kind === "make_bill") {
      const target = makeBillTarget(action);
      if (target) router.push(makeBillHref(target) as never);
      return;
    }
    if (action.kind === "sort") setSheet({ kind: "sort" });
    else showView(action.view);
  };
  const toggleSearch = () => {
    if (isSearching) setFilters((current) => ({ ...current, search: "" }));
    setIsSearching(!isSearching);
  };

  const reloadAll = useCallback(() => {
    invalidate().catch((error: unknown) => console.warn("[expenses] could not re-read the book", error));
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
        {
          text: "Try now",
          onPress: () => {
            retryQueuedExpenses(tenantId)
              .then(reloadAll)
              .catch(() => Alert.alert("Still waiting", "It could not be sent just now. It stays on this phone and is sent on its own."));
          },
        },
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

  // Bills belong to the month being lived: the hero line and the card show only on this month.
  const isThisMonth = range === null && month === monthOf(nowMs);
  const billsLine = isThisMonth && bills.data !== undefined ? stillToPayLine(billsView.still) : null;
  const openBills = () => router.push(BILLS_PATH as never);
  const payBill = (row: BillRowModel) =>
    setSheet({ kind: "pay", context: payContextFor(row.bill, targetDueOn(row.occurrence), bills.board.payments, outlets) });
  const hasNoBills = bills.data !== undefined && billsView.billCount === 0 && billsView.groups.length === 0;
  const billsCard = hasNoBills ? (
    <BillsDoor onPress={openBills} />
  ) : isThisMonth ? (
    <BillsCard
      rows={billsView.open}
      categories={categoryIndex}
      onOpen={(row) => router.push(billHref(row.bill.id) as never)}
      onPay={payBill}
      onSeeAll={openBills}
    />
  ) : null;

  const hero = (
    <HomeHero
      model={model}
      state={heroState}
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
      onDismissNeed={(item) => {
        if (item.action.kind === "make_bill") idea.dismiss(item.action.categoryId);
      }}
      bills={billsLine ? { text: billsLine, onPress: openBills } : null}
      billsCard={billsCard}
    />
  );
  const banner =
    data.error && data.hasData ? (
      <QuietBanner message="Could not refresh. Showing what was loaded before." onRetry={() => void data.refetch()} />
    ) : null;
  const pills = (
    <HomeFilterPills
      view={shown.view}
      checkCount={model.counts.check}
      categoryLabel={categoryName ? shortCategoryName(categoryName) : null}
      onView={showView}
      onCategory={() => setSheet({ kind: "category" })}
      gutterLeft={spacing.xl}
      gutterRight={isWide ? 0 : spacing.xl}
    />
  );
  const isListMode = isWide || mode === "list";
  const byCategory = <CategoryBreakdown lines={model.breakdown} onPick={showCategory} />;
  const filterRow = isReady ? (isListMode ? pills : byCategory) : null;
  const listHeader = (
    <View style={styles.listHeader}>
      {banner}
      {isWide ? null : hero}
      {isReady && !isWide ? <ModeSwitch mode={mode} onMode={setMode} /> : null}
      {filterRow}
    </View>
  );
  const waiting = hasFailed ? (
    <ErrorState title="Expenses could not load" message={data.error ?? undefined} onRetry={() => void data.refetch()} />
  ) : (
    <HomeSkeleton />
  );
  const nothingYet = (
    <EmptyState
      icon="receipt"
      title={`Nothing recorded for ${windowWords}`}
      message="When the store pays for something, like ice, LPG, rent or sahod, add it here."
      actionLabel="Add expense"
      onAction={() => setSheet({ kind: "add", categoryId: null })}
      inset
    />
  );
  const nothingMatches = (
    <EmptyState icon="search" title="Nothing matches" message="No expense here fits these filters." actionLabel="Clear filters" onAction={clearAll} inset />
  );
  const loadedEmpty = model.rows.length === 0 ? nothingYet : nothingMatches;
  const emptyList = !isReady ? waiting : isListMode ? loadedEmpty : null;

  const list = (
    <SectionList
      sections={isReady && isListMode ? model.days.map((day) => ({ key: day.date, day, data: [day] })) : []}
      keyExtractor={(day: HomeDay) => day.date}
      renderItem={({ item }) => <DayCard day={item} onOpen={openRow} />}
      renderSectionHeader={({ section }) => <DayHeader title={section.day.title} totalCents={section.day.totalCents} />}
      stickySectionHeadersEnabled
      ListHeaderComponent={listHeader}
      ListEmptyComponent={emptyList}
      contentContainerStyle={[styles.list, isWide && styles.listWide]}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
      keyboardShouldPersistTaps="handled"
      initialNumToRender={6}
      windowSize={7}
    />
  );

  // The header, the hero (month arrows) and Add stay up while a month loads or
  // fails: only the list area waits, so the owner can step to another month.
  const body = isWide ? (
    <View style={styles.columns}>
      <View style={styles.main}>{list}</View>
      <ScrollView style={styles.side} contentContainerStyle={styles.sideBody}>
        {hero}
        {isReady ? <SideBreakdown model={model} onPick={showCategory} /> : null}
      </ScrollView>
    </View>
  ) : (
    list
  );

  return (
    <View style={styles.screen}>
      {header}
      {body}
      <AddExpenseFab onPress={() => setSheet({ kind: "add", categoryId: null })} />

      {sheet?.kind === "add" ? (
        <NewExpenseSheet initialCategoryId={sheet.categoryId} onClose={() => setSheet(null)} onCommitted={reloadAll} />
      ) : null}
      {sheet?.kind === "pay" ? (
        <AddExpenseSheet visible mode={{ kind: "book" }} bill={sheet.context} onClose={() => setSheet(null)} onCommitted={reloadAll} />
      ) : null}
      {sheet?.kind === "sort" ? (
        <SortPayoutsSheet payouts={unsorted.payouts} categories={categories} recent={recent} onClose={() => setSheet(null)} onSorted={reloadAll} />
      ) : null}
      {sheet?.kind === "category" ? (
        <CategoryFilterSheet categories={categories} selectedId={shown.categoryId} onPick={showCategory} onClose={() => setSheet(null)} />
      ) : null}
      {sheet?.kind === "export" ? (
        <ExportExpensesSheet
          label={windowWords}
          expenses={data.expenses}
          categories={categories}
          window={model.window}
          isTruncated={data.isTruncated}
          isLoading={heroState === "loading"}
          hasFailed={hasFailed}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  inset: { paddingHorizontal: spacing.xl },
  list: { paddingHorizontal: spacing.xl, paddingBottom: 120 },
  listWide: { paddingRight: 0 },
  listHeader: { gap: spacing.md },
  columns: { flex: 1, flexDirection: "row", gap: spacing.xl },
  main: { flex: 3 },
  side: { flex: 2 },
  sideBody: { paddingRight: spacing.xl, paddingBottom: 120 },
});
