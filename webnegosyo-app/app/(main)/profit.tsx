import React, { useCallback, useMemo, useState } from "react";
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { useAuthStore } from "../../stores/auth-store";
import { useBranchContextStore } from "../../stores/branch-context-store";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { LoadingState } from "../../components/LoadingState";
import { ReportRangePicker } from "../../components/ReportRangePicker";
import { ScreenHeader } from "../../components/ScreenHeader";
import { SegmentedControl } from "../../components/SegmentedControl";
import { Chip } from "../../components/expenses/AddExpenseParts";
import { CashFlowCard, MoneyWent, PrimeCostBar, ProfitSentenceCard, ProfitTrend, TrustStrip } from "../../components/profit/ProfitParts";
import { refreshWithMinSpinner } from "../../lib/query/pull-to-refresh";
import type { ReportSelection } from "../../lib/report-window";
import { useAccountBranchScope } from "../../lib/use-branch-scope";
import { useOutlets } from "../../lib/use-outlets";
import { ALL_BRANCHES, UNASSIGNED, resolveProfitBranch, type BranchChoice } from "../../lib/profit/profit-branch";
import {
  PRESET_LABELS,
  addDays,
  checkCustomRange,
  manilaDay,
  profitCaption,
  resolveProfitWindow,
  type ProfitSelection,
} from "../../lib/profit/profit-period";
import {
  PROFIT_LOCKED_MESSAGE,
  PROFIT_PLATFORM_ONLY_MESSAGE,
  canSeeProfit,
  findingPhrase,
  findingRow,
  type FindingRow,
} from "../../lib/profit/profit-view";
import { useProfit } from "../../lib/profit/use-profit";
import { colors, radius, spacing, typography } from "../../theme/colors";

type View_ = "profit" | "cash";

const VIEWS: readonly { label: string; value: View_ }[] = [
  { label: "Profit", value: "profit" },
  { label: "Cash flow", value: "cash" },
];
const PRESETS = ["this_month", "last_month", "this_week"] as const;
const EXPENSES = "/(main)/expenses";

function selectionToKeys(selection: ReportSelection, nowMs: number): { fromKey: string; toKey: string } {
  if (selection.kind === "day") return { fromKey: selection.dayKey, toKey: selection.dayKey };
  if (selection.kind === "range") return { fromKey: selection.fromKey, toKey: selection.toKey };
  const today = manilaDay(nowMs);
  return { fromKey: addDays(today, -(selection.days - 1)), toKey: today };
}

/**
 * Profit (plan §5.3): one sentence — Sales − Ingredients − Expenses = Profit —
 * then what to fix before believing it, prime cost, where the money went, the
 * trend and cash flow. Every figure comes from the web's one profit model over
 * the platform's report functions, read as the signed-in user.
 *
 * The tab rides `reports`; this screen also needs `expenses` + `costs`, and
 * the database refuses the same callers (reporting.assert_profit_access).
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

  const isAllowed = canSeeProfit({ role, isOwner, permissions });
  const isPlatform = orderBackend === "platform";

  const [selection, setSelection] = useState<ProfitSelection>({ preset: "this_month" });
  const [choice, setChoice] = useState<BranchChoice>(selectedOutlet ?? ALL_BRANCHES);
  const [view, setView] = useState<View_>("profit");
  const [isPickingRange, setIsPickingRange] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const nowMs = Date.now();
  const period = resolveProfitWindow(selection, nowMs);
  const branchView = resolveProfitBranch({ account, accountOutletName, outlets, choice });
  const profit = useProfit(period, branchView.branch, isAllowed && isPlatform);
  const data = profit.data;

  const findings = useMemo(
    () =>
      data?.status === "ready"
        ? data.report.findings.map((finding) => findingRow(finding, findingPhrase(period.phrase, period.isPartial)))
        : [],
    // The phrase follows the chosen period, not the clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, period.phrase, period.isPartial],
  );

  const refresh = useCallback(() => refreshWithMinSpinner([profit.refetch], setIsRefreshing), [profit.refetch]);

  const onFinding = (row: FindingRow) => {
    const action = row.action;
    if (!action) return;
    if (action.kind === "record") router.push(`${EXPENSES}?add=1&category=${encodeURIComponent(action.categoryId)}` as never);
    else if (action.kind === "add") router.push(`${EXPENSES}?add=1` as never);
    else if (action.kind === "sort") router.push(`${EXPENSES}?view=unsorted` as never);
    else router.push("/(main)/product-management" as never);
  };

  const openCategory = (categoryId: string) =>
    router.push(`${EXPENSES}?category=${encodeURIComponent(categoryId)}&month=${period.fromKey.slice(0, 7)}` as never);

  const applyRange = (picked: ReportSelection) => {
    const keys = selectionToKeys(picked, Date.now());
    const verdict = checkCustomRange(keys.fromKey, keys.toKey, Date.now());
    if (!verdict.ok) {
      Alert.alert("Pick a shorter range", verdict.reason);
      return;
    }
    setIsPickingRange(false);
    setSelection({ preset: "custom", ...keys });
  };

  const header = (
    <ScreenHeader title="Profit" subtitle="What you kept: sales, minus ingredients, minus expenses">
      {isAllowed && isPlatform ? (
        <SegmentedControl options={VIEWS} value={view} onChange={setView} accessibilityPrefix="Show" />
      ) : null}
    </ScreenHeader>
  );

  if (!isAllowed || data?.status === "locked") {
    return (
      <View style={styles.screen}>
        {header}
        <EmptyState icon="lock" title="Profit is locked" message={PROFIT_LOCKED_MESSAGE} inset />
      </View>
    );
  }
  if (!isPlatform || data?.status === "not_set_up") {
    return (
      <View style={styles.screen}>
        {header}
        <EmptyState
          icon="info"
          title="Not available for this store yet"
          message={data?.status === "not_set_up" ? data.message : PROFIT_PLATFORM_ONLY_MESSAGE}
          inset
        />
      </View>
    );
  }

  const ready = data?.status === "ready" ? data : null;
  const caption = profitCaption(period, branchView.label);

  return (
    <View style={styles.screen}>
      {header}
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {PRESETS.map((preset) => (
            <Chip
              key={preset}
              label={PRESET_LABELS[preset]}
              isOn={selection.preset === preset}
              onPress={() => setSelection({ preset })}
            />
          ))}
          <Chip
            label={selection.preset === "custom" ? period.label : "Custom"}
            icon="calendar"
            isOn={selection.preset === "custom"}
            onPress={() => setIsPickingRange(true)}
            accessibilityLabel="Pick custom days, up to 93"
          />
        </ScrollView>
        {branchView.canPick ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Chip label="All branches" isOn={!branchView.branch.outletId && !branchView.branch.unassigned} onPress={() => setChoice(ALL_BRANCHES)} />
            {outlets.map((outlet) => (
              <Chip key={outlet.id} label={outlet.name} isOn={branchView.branch.outletId === outlet.id} onPress={() => setChoice(outlet.id)} />
            ))}
            <Chip label="Store-wide only" isOn={branchView.branch.unassigned} onPress={() => setChoice(UNASSIGNED)} />
          </ScrollView>
        ) : null}

        {profit.isLoading && !ready ? (
          <LoadingState />
        ) : !ready ? (
          <EmptyState
            icon="warning"
            title="Profit couldn’t load"
            message={data && data.status !== "ready" ? data.message : profit.error ?? "Pull down to try again."}
            actionLabel="Try again"
            onAction={() => void profit.refetch()}
            inset
          />
        ) : view === "cash" ? (
          <CashFlowCard report={ready.report} onSort={() => router.push(`${EXPENSES}?view=unsorted` as never)} />
        ) : (
          <>
            {ready.isFirstRun ? (
              <View style={styles.firstRun}>
                <Text style={styles.firstRunTitle}>Profit = Sales − Ingredients − Expenses</Text>
                <Text style={styles.firstRunBody}>
                  We already know your sales. Add your first expense and we’ll do the math.
                </Text>
                <Button label="Add expense" icon="plus" onPress={() => router.push(`${EXPENSES}?add=1` as never)} />
              </View>
            ) : null}
            <ProfitSentenceCard
              report={ready.report}
              caption={caption}
              isInfoOpen={isInfoOpen}
              onToggleInfo={() => setIsInfoOpen((open) => !open)}
            />
            <TrustStrip rows={findings} onAction={onFinding} />
            <PrimeCostBar report={ready.report} />
            <MoneyWent report={ready.report} onOpen={openCategory} />
            {ready.trend ? <ProfitTrend bars={ready.trend} /> : null}
          </>
        )}
      </ScrollView>

      {isPickingRange ? (
        <ReportRangePicker
          visible
          selection={
            selection.preset === "custom"
              ? { kind: "range", fromKey: selection.fromKey, toKey: selection.toKey }
              : { kind: "range", fromKey: period.fromKey, toKey: manilaDay(Math.max(period.start, period.end - 1)) }
          }
          nowMs={nowMs}
          onApply={applyRange}
          onClose={() => setIsPickingRange(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { padding: spacing.lg, paddingTop: 0, paddingBottom: spacing.xxl * 2, gap: spacing.md },
  chips: { gap: spacing.sm, paddingVertical: 2 },
  firstRun: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.separator,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  firstRunTitle: { ...typography.heading, color: colors.textPrimary },
  firstRunBody: { ...typography.body, color: colors.textSecondary },
});
