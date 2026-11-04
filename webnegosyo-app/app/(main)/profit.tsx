import React, { useCallback, useMemo, useState } from "react";
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { useAuthStore } from "../../stores/auth-store";
import { useBranchContextStore } from "../../stores/branch-context-store";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { ReportRangePicker } from "../../components/ReportRangePicker";
import { ScreenHeader } from "../../components/ScreenHeader";
import { SegmentedControl } from "../../components/SegmentedControl";
import { useIsWideReports } from "../../components/reports/ReportsColumns";
import { CashFlowCard } from "../../components/profit/CashFlowCard";
import { ProfitBody } from "../../components/profit/ProfitBody";
import { ProfitPeriodBar, type BranchPill } from "../../components/profit/ProfitPeriodBar";
import { ProfitSkeleton, RefreshBanner } from "../../components/profit/ProfitStates";
import { refreshWithMinSpinner } from "../../lib/query/pull-to-refresh";
import type { ReportSelection } from "../../lib/report-window";
import { useAccountBranchScope } from "../../lib/use-branch-scope";
import { useOutlets } from "../../lib/use-outlets";
import { ALL_BRANCHES, UNASSIGNED, resolveProfitBranch, type BranchChoice, type ProfitBranchView } from "../../lib/profit/profit-branch";
import { findingCards, type FindingCard } from "../../lib/profit/profit-findings";
import { EXPENSES_ROUTE, expensesHref, findingHref, lastReadDay, readRange } from "../../lib/profit/profit-links";
import {
  addDays,
  checkCustomRange,
  businessDayAt,
  resolveProfitWindow,
  type ProfitPreset,
  type ProfitSelection,
} from "../../lib/profit/profit-period";
import { profitScreenState } from "../../lib/profit/profit-screen-state";
import { canSeeProfit, findingPhrase } from "../../lib/profit/profit-view";
import { billForecastLine } from "../../lib/profit/profit-bills";
import { useProfit } from "../../lib/profit/use-profit";
import { useTradingDay } from "../../lib/business-day/use-trading-day";
import type { CutoffSchedule } from "../../lib/business-day/trading-day";
import { useProfitBills } from "../../lib/profit/use-profit-bills";
import { newBillHref } from "../../lib/expenses/bill-links";
import { colors, spacing } from "../../theme/colors";

type ProfitView = "profit" | "cash";

const VIEWS: readonly { label: string; value: ProfitView }[] = [
  { label: "Profit", value: "profit" },
  { label: "Cash flow", value: "cash" },
];

function selectionToKeys(selection: ReportSelection, nowMs: number, schedule: CutoffSchedule): { fromKey: string; toKey: string } {
  if (selection.kind === "day") return { fromKey: selection.dayKey, toKey: selection.dayKey };
  if (selection.kind === "range") return { fromKey: selection.fromKey, toKey: selection.toKey };
  const today = businessDayAt(nowMs, schedule);
  return { fromKey: addDays(today, -(selection.days - 1)), toKey: today };
}

function branchPills(view: ProfitBranchView, outlets: readonly { id: string; name: string }[], pick: (choice: BranchChoice) => void): BranchPill[] | null {
  if (!view.canPick) return null;
  const { outletId, unassigned } = view.branch;
  return [
    { key: ALL_BRANCHES, label: "All branches", isOn: !outletId && !unassigned, onPress: () => pick(ALL_BRANCHES) },
    ...outlets.map((outlet) => ({ key: outlet.id, label: outlet.name, isOn: outletId === outlet.id, onPress: () => pick(outlet.id) })),
    { key: UNASSIGNED, label: "Store-wide only", isOn: unassigned, onPress: () => pick(UNASSIGNED) },
  ];
}

const go = (href: string) => router.push(href as never);

/**
 * Profit (design §5): what the owner kept — Sales − Ingredients − Expenses —
 * as a figure and a sentence, the food/staff/rent guides, where the money
 * went, the trend and what to check; Cash flow beside it. Every figure comes
 * from the web's one profit model over the platform's report functions, read
 * as the signed-in user (the database refuses the same callers).
 */
export default function ProfitScreen() {
  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);
  const orderBackend = useAuthStore((s) => s.orderBackend);
  const accountOutletName = useAuthStore((s) => s.outletName);
  const selectedOutlet = useBranchContextStore((s) => s.selectedOutletId);
  const account = useAccountBranchScope();
  const { outlets } = useOutlets();
  const isWide = useIsWideReports();

  const isAllowed = canSeeProfit({ role, isOwner, permissions });
  const isPlatform = orderBackend === "platform";

  const [selection, setSelection] = useState<ProfitSelection>({ preset: "this_month" });
  const [choice, setChoice] = useState<BranchChoice>(selectedOutlet ?? ALL_BRANCHES);
  const [view, setView] = useState<ProfitView>("profit");
  const [isPickingRange, setIsPickingRange] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const nowMs = Date.now();
  // Business days, as the profit SQL dates its facts (20261027180000).
  const { schedule } = useTradingDay();
  const period = resolveProfitWindow(selection, nowMs, schedule);
  const branchView = resolveProfitBranch({ account, accountOutletName, outlets, choice });
  const profit = useProfit(period, branchView.branch, isAllowed && isPlatform);
  const state = profitScreenState({ isAllowed, isPlatform, data: profit.data, isLoading: profit.isLoading, error: profit.error });
  const range = readRange(period);
  // Bills to pay: the surest "not paid yet" warnings, and what is left once they are paid.
  const bills = useProfitBills(isAllowed && isPlatform, branchView.branch, range);

  const findings = useMemo(
    () =>
      state.kind === "ready"
        ? findingCards(state.data.report.findings, findingPhrase(period.phrase, period.isPartial), state.data.isFirstRun, bills.findings)
        : [],
    // The phrase follows the chosen period, not the clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profit.data, period.phrase, period.isPartial, bills.findings],
  );
  const forecast =
    state.kind === "ready"
      ? billForecastLine({
          profitCents: state.data.report.profitCents,
          isCurrentPartialMonth: period.preset === "this_month" && period.isPartial,
          still: bills.still,
        })
      : null;

  const refresh = useCallback(() => refreshWithMinSpinner([profit.refetch], setIsRefreshing), [profit.refetch]);

  const pickPeriod = (preset: ProfitPreset) => {
    if (preset === "custom") setIsPickingRange(true);
    else setSelection({ preset });
  };

  const applyRange = (picked: ReportSelection) => {
    const keys = selectionToKeys(picked, Date.now(), schedule);
    const verdict = checkCustomRange(keys.fromKey, keys.toKey, Date.now(), schedule);
    if (!verdict.ok) {
      Alert.alert(verdict.title, verdict.reason);
      return;
    }
    setIsPickingRange(false);
    setSelection({ preset: "custom", ...keys });
  };

  const isOpen = state.kind !== "locked" && state.kind !== "not_set_up";
  const header = (
    <ScreenHeader title="Profit" subtitle={branchView.label ?? "Sales, minus ingredients and expenses"}>
      {isOpen ? <SegmentedControl options={VIEWS} value={view} onChange={setView} accessibilityPrefix="Show" /> : null}
    </ScreenHeader>
  );

  if (state.kind === "locked" || state.kind === "not_set_up") {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.inset}>
          {state.kind === "locked" ? (
            <EmptyState icon="lock" title="Profit is locked" message={state.message} inset />
          ) : (
            <EmptyState icon="info" title="Not available for this store yet" message={state.message} inset />
          )}
        </View>
      </View>
    );
  }

  const onFinding = (card: FindingCard) => {
    if (card.action) go(findingHref(card.action));
  };

  return (
    <View style={styles.screen}>
      {header}
      <ScrollView contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}>
        <ProfitPeriodBar preset={selection.preset} onPick={pickPeriod} branches={branchPills(branchView, outlets, setChoice)} />
        {state.kind === "loading" ? <ProfitSkeleton /> : null}
        {state.kind === "error" ? (
          <ErrorState title="Profit couldn’t load" message={state.message} onRetry={() => void profit.refetch()} />
        ) : null}
        {state.kind === "ready" && state.refreshError ? <RefreshBanner onRetry={() => void profit.refetch()} /> : null}
        {state.kind === "ready" && view === "cash" ? (
          <CashFlowCard report={state.data.report} onSort={() => go(`${EXPENSES_ROUTE}?view=unsorted`)} />
        ) : null}
        {state.kind === "ready" && view === "profit" ? (
          <ProfitBody
            data={state.data}
            period={period}
            findings={findings}
            isWide={isWide}
            forecast={forecast}
            onAddExpense={() => go(`${EXPENSES_ROUTE}?add=1`)}
            onSetUpBills={() => go(newBillHref())}
            onFinding={onFinding}
            onOpenCategory={(categoryId) => go(expensesHref(range, categoryId))}
            onOpenAllExpenses={() => go(expensesHref(range))}
          />
        ) : null}
      </ScrollView>

      {isPickingRange ? (
        <ReportRangePicker
          visible
          selection={
            selection.preset === "custom"
              ? { kind: "range", fromKey: selection.fromKey, toKey: selection.toKey }
              : { kind: "range", fromKey: period.fromKey, toKey: lastReadDay(period) }
          }
          nowMs={nowMs}
          schedule={schedule}
          onApply={applyRange}
          onClose={() => setIsPickingRange(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  inset: { paddingHorizontal: spacing.xl },
  body: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl * 2, gap: spacing.md },
});
