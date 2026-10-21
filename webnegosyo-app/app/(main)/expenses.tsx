import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, RefreshControl, ScrollView, SectionList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { useBranchContextStore } from "../../stores/branch-context-store";
import { AddExpenseSheet } from "../../components/expenses/AddExpenseSheet";
import { Chip } from "../../components/expenses/AddExpenseParts";
import { ExpenseRow } from "../../components/expenses/ExpenseRow";
import { SortPayoutsSheet } from "../../components/expenses/SortPayoutsSheet";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { IconButton } from "../../components/IconButton";
import { LoadingState } from "../../components/LoadingState";
import { ScreenHeader } from "../../components/ScreenHeader";
import { PAID_FROM_LABELS, formatCents, monthLabel, monthOf, shiftMonth, spokenCents } from "../../lib/expenses/expense-format";
import {
  NO_FILTERS,
  buildExpenseSections,
  categoryFilterChoices,
  monthSpentCents,
  type ExpenseListFilters,
  type ExpenseListRow,
} from "../../lib/expenses/expense-list";
import { computeFlagsForAll } from "../../lib/expenses/flags";
import { dismissQueuedExpense, retryQueuedExpenses } from "../../lib/expenses/live-expense-queue";
import { PAID_FROM, type PaidFrom } from "../../lib/expenses/types";
import {
  useDeviceExpenseQueue,
  useExpenseCategories,
  useExpenseMonth,
  useExpenseTenant,
  useInvalidateExpenses,
  useRecentExpenses,
  useUnsortedPayouts,
} from "../../lib/expenses/use-expenses";
import { refreshWithMinSpinner } from "../../lib/query/pull-to-refresh";
import { colors, radius, shadow, spacing, typography } from "../../theme/colors";

type FilterPanel = "category" | "paidFrom" | null;

/**
 * The expense book (plan §5.2): one month, its total, the old drawer pay-outs
 * still to sort, and every expense grouped by day. Recording happens here
 * (+ Expense), on Home, and on the Drawer; this is where it is read, fixed and
 * sorted. Reached from Reports, under Money; gated on the `expenses` key.
 */
export default function ExpensesScreen() {
  const tenantId = useExpenseTenant();
  const invalidate = useInvalidateExpenses();
  const params = useLocalSearchParams<{ add?: string }>();
  const selectedOutlet = useBranchContextStore((s) => s.selectedOutletId);

  const [month, setMonth] = useState(() => monthOf(Date.now()));
  const [filters, setFilters] = useState<ExpenseListFilters>(NO_FILTERS);
  const [panel, setPanel] = useState<FilterPanel>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isSorting, setIsSorting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Home's "+ Expense" lands here with the sheet up.
  useEffect(() => {
    if (params.add !== "1") return;
    setIsAdding(true);
    router.setParams({ add: undefined });
  }, [params.add]);

  const monthRead = useExpenseMonth(month, selectedOutlet ?? undefined);
  const { categories } = useExpenseCategories();
  const { expenses: recent } = useRecentExpenses();
  const queue = useDeviceExpenseQueue();
  const unsorted = useUnsortedPayouts(true);

  const expenses = useMemo(() => monthRead.data?.expenses ?? [], [monthRead.data]);
  const flagsById = useMemo(() => computeFlagsForAll(expenses, { categories }), [expenses, categories]);
  const sections = useMemo(
    () =>
      buildExpenseSections({
        expenses,
        queued: queue.expenses,
        categories,
        flagsById,
        waitingReceipts: queue.waitingReceipts,
        filters,
        month,
      }),
    [expenses, queue.expenses, queue.waitingReceipts, categories, flagsById, filters, month],
  );
  const totals = useMemo(() => monthSpentCents(expenses, categories), [expenses, categories]);
  const categoryChoices = useMemo(() => categoryFilterChoices(expenses, categories), [expenses, categories]);
  const lookCount = useMemo(
    () => expenses.filter((e) => e.status === "recorded" && (flagsById[e.id]?.length ?? 0) > 0).length,
    [expenses, flagsById],
  );
  const thisMonth = monthOf(Date.now());

  const refresh = useCallback(
    () =>
      refreshWithMinSpinner(
        [monthRead.refetch, unsorted.refetch, async () => {
          if (tenantId) await retryQueuedExpenses(tenantId);
        }],
        setIsRefreshing,
      ),
    [monthRead.refetch, unsorted.refetch, tenantId],
  );

  const reloadAll = useCallback(() => {
    void invalidate();
  }, [invalidate]);

  const openRow = useCallback(
    (row: ExpenseListRow) => {
      if (row.expenseId) {
        router.push(`/(main)/expense/${row.expenseId}` as never);
        return;
      }
      if (!row.queuedId || !tenantId) return;
      const queuedId = row.queuedId;
      if (row.refusedReason) {
        Alert.alert("Not saved", row.refusedReason, [
          { text: "Keep it", style: "cancel" },
          { text: "Remove from this phone", style: "destructive", onPress: () => void dismissQueuedExpense(queuedId) },
        ]);
        return;
      }
      Alert.alert("Waiting to sync", "This expense is saved on this phone and will be sent when the connection is back.", [
        { text: "OK", style: "cancel" },
        { text: "Try now", onPress: () => void retryQueuedExpenses(tenantId).then(reloadAll) },
      ]);
    },
    [tenantId, reloadAll],
  );

  const categoryLabel = filters.categoryId
    ? categoryChoices.find((choice) => choice.id === filters.categoryId)?.label ?? "Category"
    : "Category";
  const paidFromLabel = filters.paidFrom ? PAID_FROM_LABELS[filters.paidFrom] : "Paid from";
  const isFiltered = filters.categoryId !== null || filters.paidFrom !== null || filters.needsLook;

  const header = (
    <View style={styles.head}>
      <View style={styles.monthRow}>
        <IconButton icon="chevron-left" label="Previous month" onPress={() => setMonth(shiftMonth(month, -1))} />
        <Text style={styles.monthLabel} accessibilityRole="header">
          {monthLabel(month)}
        </Text>
        <IconButton
          icon="chevron"
          label="Next month"
          onPress={() => setMonth(shiftMonth(month, 1))}
          disabled={month >= thisMonth}
        />
      </View>
      <Text style={styles.totalLabel}>{month === thisMonth ? "Gastos this month" : `Gastos in ${monthLabel(month)}`}</Text>
      <Text
        style={styles.total}
        numberOfLines={1}
        adjustsFontSizeToFit
        accessibilityLabel={`Spent ${spokenCents(totals.spentCents)}`}
      >
        {formatCents(totals.spentCents, { compact: true })}
      </Text>
      {totals.takenOutCents > 0 ? (
        <Text style={styles.totalNote}>
          + {formatCents(totals.takenOutCents, { compact: true })} cash taken out (not an expense)
        </Text>
      ) : null}
      {monthRead.data?.isTruncated ? (
        <Text style={styles.totalNote}>This month has more rows than the phone can show; the total may be short. Open it on the web.</Text>
      ) : null}

      {unsorted.payouts.length > 0 ? (
        <TouchableOpacity
          style={styles.banner}
          onPress={() => setIsSorting(true)}
          accessibilityRole="button"
          accessibilityLabel={`${unsorted.payouts.length} drawer pay-outs to sort`}
        >
          <Icon name="drawer" size={18} color={colors.statusPending.text} />
          <Text style={styles.bannerText}>
            {unsorted.payouts.length} drawer {unsorted.payouts.length === 1 ? "pay-out" : "pay-outs"} to sort
          </Text>
          <Icon name="chevron" size={16} color={colors.statusPending.text} />
        </TouchableOpacity>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        <Chip
          label={categoryLabel}
          icon="chevron-down"
          isOn={filters.categoryId !== null}
          onPress={() => setPanel(panel === "category" ? null : "category")}
        />
        <Chip
          label={paidFromLabel}
          icon="chevron-down"
          isOn={filters.paidFrom !== null}
          onPress={() => setPanel(panel === "paidFrom" ? null : "paidFrom")}
        />
        <Chip
          label={lookCount > 0 ? `Needs a look (${lookCount})` : "Needs a look"}
          icon="info"
          isOn={filters.needsLook}
          onPress={() => setFilters({ ...filters, needsLook: !filters.needsLook })}
        />
        {isFiltered ? <Chip label="Clear" icon="close" onPress={() => setFilters(NO_FILTERS)} /> : null}
      </ScrollView>
      {panel === "category" ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          <Chip label="All" isOn={filters.categoryId === null} onPress={() => setFilters({ ...filters, categoryId: null })} />
          {categoryChoices.map((choice) => (
            <Chip
              key={choice.id}
              label={choice.label}
              isOn={filters.categoryId === choice.id}
              onPress={() => {
                setFilters({ ...filters, categoryId: choice.id });
                setPanel(null);
              }}
            />
          ))}
        </ScrollView>
      ) : null}
      {panel === "paidFrom" ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          <Chip label="All" isOn={filters.paidFrom === null} onPress={() => setFilters({ ...filters, paidFrom: null })} />
          {PAID_FROM.map((source: PaidFrom) => (
            <Chip
              key={source}
              label={PAID_FROM_LABELS[source]}
              isOn={filters.paidFrom === source}
              onPress={() => {
                setFilters({ ...filters, paidFrom: source });
                setPanel(null);
              }}
            />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );

  const body = monthRead.isLoading ? (
    <LoadingState />
  ) : (
    <SectionList
      sections={sections.map((section) => ({ ...section, data: section.rows }))}
      keyExtractor={(row) => row.key}
      renderItem={({ item }) => <ExpenseRow row={item} onPress={openRow} />}
      renderSectionHeader={({ section }) => (
        <View style={styles.dayHeader} accessibilityRole="header">
          <Text style={styles.dayTitle}>{section.title}</Text>
          <Text style={styles.dayTotal}>{formatCents(section.totalCents, { compact: true })}</Text>
        </View>
      )}
      stickySectionHeadersEnabled
      ListHeaderComponent={header}
      ListEmptyComponent={
        monthRead.error ? (
          <EmptyState
            icon="warning"
            title="Expenses could not be loaded"
            message={monthRead.error}
            actionLabel="Try again"
            onAction={() => void monthRead.refetch()}
            inset
          />
        ) : isFiltered ? (
          <EmptyState
            icon="search"
            title="Nothing matches"
            message="No expense this month fits these filters."
            actionLabel="Clear filters"
            onAction={() => setFilters(NO_FILTERS)}
            inset
          />
        ) : (
          <EmptyState
            icon="receipt"
            title={`No expenses recorded for ${monthLabel(month)}`}
            message="Kung may binayaran ka, idagdag dito — ice, LPG, rent, sahod."
            actionLabel="Add expense"
            onAction={() => setIsAdding(true)}
            inset
          />
        )
      }
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
      initialNumToRender={20}
      windowSize={9}
    />
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Expenses" subtitle="What the store spent, and on what" />
      {body}
      <View style={styles.fabWrap} pointerEvents="box-none">
        <Button label="Expense" icon="plus" onPress={() => setIsAdding(true)} style={styles.fab} accessibilityLabel="Add an expense" />
      </View>

      {isAdding ? (
        <AddExpenseSheet visible mode={{ kind: "book" }} onClose={() => setIsAdding(false)} onCommitted={reloadAll} />
      ) : null}
      {isSorting ? (
        <SortPayoutsSheet
          payouts={unsorted.payouts}
          categories={categories}
          recent={recent}
          onClose={() => setIsSorting(false)}
          onSorted={reloadAll}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { paddingBottom: 120 },
  head: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.xs },
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  monthLabel: { ...typography.heading, color: colors.textPrimary },
  totalLabel: { ...typography.caption, color: colors.textMuted, marginTop: spacing.sm },
  total: { fontSize: 34, fontWeight: "800", color: colors.textPrimary, fontVariant: ["tabular-nums"], letterSpacing: -0.5 },
  totalNote: { ...typography.caption, color: colors.textMuted },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.statusPending.bg,
  },
  bannerText: { ...typography.body, fontWeight: "700", color: colors.statusPending.text, flex: 1 },
  filters: { gap: spacing.sm, paddingVertical: spacing.sm },
  dayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    backgroundColor: colors.background,
  },
  dayTitle: { ...typography.caption, fontWeight: "800", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.6 },
  dayTotal: { ...typography.caption, fontWeight: "800", color: colors.textMuted, fontVariant: ["tabular-nums"] },
  fabWrap: { position: "absolute", right: spacing.lg, bottom: spacing.lg },
  fab: { ...shadow.md, paddingHorizontal: spacing.xl },
});
