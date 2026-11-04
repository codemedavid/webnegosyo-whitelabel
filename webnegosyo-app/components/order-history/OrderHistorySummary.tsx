import React, { useCallback, useState } from "react";
import { Alert, RefreshControl } from "react-native";
import { router } from "expo-router";

import { ItemSummaryPanel } from "./ItemSummaryPanel";
import { useAuthStore } from "../../stores/auth-store";
import { DEMO_READONLY_MESSAGE } from "../../lib/demo";
import { refreshWithMinSpinner } from "../../lib/query/pull-to-refresh";
import type { RefRoute } from "../../lib/backends/route";
import type { CutoffSchedule } from "../../lib/business-day/trading-day";
import { describeSelection, resolveReportWindow, todaySelection, type ReportSelection } from "../../lib/report-window";
import { itemSummaryBranchArgs, type ItemSummary } from "../../lib/reports/item-summary";
import { printItemSummary, shareItemSummary, type ItemSummarySlipContext } from "../../lib/reports/item-summary-print";
import { useItemSummary, type ItemSummaryViewState } from "../../lib/reports/use-item-summary";
import { colors } from "../../theme/colors";

const PRINTER_SETTINGS_ROUTE = "/(main)/printer-settings";

interface OrderHistorySummaryProps {
  /** The Orders screen's header (title, period bar, view switch). */
  header: React.ReactElement;
  /** A picked day or range — never the live queue. */
  selection: ReportSelection;
  nowMs: number;
  schedule: CutoffSchedule;
  /** The branch being looked at: a branch id, `__unassigned__`, or null = whole store. */
  outletFilter: string | null;
  branchName?: string;
  route: RefRoute;
}

/** The picked business days, both ends inclusive (a preset never reaches here; it reads as today). */
function pickedDays(selection: ReportSelection, nowMs: number, schedule: CutoffSchedule): { fromKey: string; toKey: string } {
  const picked = selection.kind === "preset" ? todaySelection(nowMs, schedule) : selection;
  if (picked.kind === "range") return { fromKey: picked.fromKey, toKey: picked.toKey };
  const dayKey = picked.kind === "day" ? picked.dayKey : "";
  return { fromKey: dayKey, toKey: dayKey };
}

function askToSetUpPrinter(message: string): void {
  Alert.alert("No receipt printer", message, [
    { text: "Not now", style: "cancel" },
    { text: "Printer settings", onPress: () => router.push(PRINTER_SETTINGS_ROUTE as never) },
  ]);
}

/**
 * The item summary for the picked days: reads (platform stores only), prints
 * on the cashier printer and shares as text. The panel draws; this decides.
 */
export function OrderHistorySummary({ header, selection, nowMs, schedule, outletFilter, branchName, route }: OrderHistorySummaryProps) {
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const storeName = useAuthStore((s) => s.tenantName) ?? "Store";
  const isDemo = useAuthStore((s) => s.isDemo);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const isPlatform = route === "platform";
  const window = resolveReportWindow(selection, nowMs, schedule);
  const request =
    isPlatform && tenantId ? { tenantId, startMs: window.startMs, endMs: window.endMs, ...itemSummaryBranchArgs(outletFilter) } : null;
  const { state, refetch } = useItemSummary(request);
  const viewState: ItemSummaryViewState = isPlatform ? state : { kind: "unavailable" };
  const summary: ItemSummary | null = viewState.kind === "ready" ? viewState.summary : null;

  const context: ItemSummarySlipContext = { storeName, branchName, ...pickedDays(selection, nowMs, schedule) };

  const print = useCallback(async () => {
    if (!summary) return;
    if (isDemo) {
      Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
      return;
    }
    setIsPrinting(true);
    try {
      const outcome = await printItemSummary(summary, context);
      if (outcome.ok) return;
      if (outcome.isNoPrinter) askToSetUpPrinter(outcome.message);
      else Alert.alert("Couldn't print", outcome.message);
    } finally {
      setIsPrinting(false);
    }
  }, [summary, isDemo, context]);

  const refresh = useCallback(() => refreshWithMinSpinner([refetch], setIsRefreshing), [refetch]);

  return (
    <ItemSummaryPanel
      header={header}
      state={viewState}
      periodLabel={describeSelection(selection, nowMs, schedule)}
      isPrinting={isPrinting}
      onRetry={() => void refetch()}
      onPrint={() => void print()}
      onShare={() => {
        if (summary) void shareItemSummary(summary, context);
      }}
      refreshControl={
        isPlatform ? <RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={colors.primary} /> : undefined
      }
    />
  );
}

