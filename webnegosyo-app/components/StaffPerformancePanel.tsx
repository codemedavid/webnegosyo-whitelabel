import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, TouchableOpacity, View, StyleSheet } from "react-native";
import type { FunctionReference } from "convex/server";
import { useAuthStore } from "../stores/auth-store";
import { useSafeQuery } from "../lib/hooks";
import { useBranchScope } from "../lib/use-branch-scope";
import { filterOrdersToScope } from "../lib/branch-scope";
import { buildKpiPeriod } from "../lib/branch-period";
import { summarizeStaffPerformance } from "../lib/staff-analytics";
import { listShifts, type ShiftRecord } from "../lib/shift-service";
import { reconcileShift } from "../lib/shift";
import type { StaffMember } from "../lib/staff-service";
import type { CounterSale } from "../lib/pos-sales";
import { OrderSettlementReader } from "./OrderSettlementReader";
import { formatPeso } from "../lib/format";
import { colors, spacing } from "../theme/colors";
import { useRefetchOnScreenFocus } from "../lib/query/use-screen-focus";

const ref = "orders:getOrders" as unknown as FunctionReference<"query">;
const LIMIT = 1000;
const PERIODS = ["today", "7d", "30d"] as const;

/** Augments the existing, permission-aware roster; never replaces staff management. */
export function StaffPerformancePanel({ staff }: { staff: StaffMember[] }) {
  const tenantId = useAuthStore(s => s.impersonatedTenantId ?? s.tenantId);
  const isDemo = useAuthStore(s => s.isDemo);
  const scope = useBranchScope();
  const outletId = scope.kind === "branch" ? scope.outletId : undefined;
  const [periodKey, setPeriodKey] = useState<typeof PERIODS[number]>("today");
  const period = buildKpiPeriod(periodKey === "today" ? 1 : periodKey === "7d" ? 7 : 30, Date.now());
  const { data, error, isLoading } = useSafeQuery<CounterSale[]>(ref, isDemo ? "skip" : { limit: LIMIT });
  const orders = useMemo(() => [...filterOrdersToScope(scope, data)], [scope, data]);
  const [history, setHistory] = useState<{ key: string; rows: ShiftRecord[]; error: string | null } | null>(null);
  const key = JSON.stringify([tenantId, outletId, period.startMs]);
  const historyRequest = useRef(0);
  const loadHistory = useCallback(async () => {
    const request = ++historyRequest.current;
    if (!tenantId || isDemo) { setHistory({ key, rows: [], error: null }); return; }
    try {
      const rows = await listShifts(tenantId, { outletId, sinceIso: new Date(period.startMs).toISOString() });
      if (request === historyRequest.current) setHistory({ key, rows, error: null });
    } catch (failure) {
      if (request === historyRequest.current) setHistory({ key, rows: [], error: failure instanceof Error ? failure.message : "Shift history unavailable." });
    }
  }, [tenantId, isDemo, outletId, period.startMs, key]);
  useEffect(() => { void loadHistory(); return () => { historyRequest.current += 1; }; }, [loadHistory]);
  useRefetchOnScreenFocus({ enabled: !!tenantId && !isDemo, staleMs: 0, dataUpdatedAt: 0, isFetching: false, refetch: loadHistory });
  const nameOf = (id: string) => {
    const member = staff.find(row => row.userId === id);
    return member?.displayName ?? member?.email ?? history?.rows.find(row => row.staffUserId === id)?.staffName ?? "Former staff";
  };
  return <View style={styles.panel}>
    <Text style={styles.title}>Staff sales and shifts</Text>
    <View style={styles.periods}>{PERIODS.map(value => <TouchableOpacity key={value} onPress={() => setPeriodKey(value)} accessibilityRole="button" accessibilityState={{ selected: value === periodKey }}>
      <Text style={styles.text}>{value === "today" ? "Today" : value === "7d" ? "7 days" : "30 days"}</Text>
    </TouchableOpacity>)}</View>
    {isLoading ? <Text style={styles.text}>Loading sales…</Text> : error || (data?.length ?? 0) >= LIMIT ?
      <Text style={styles.text}>{error ?? "This report exceeds the available order history. Totals are unavailable."}</Text> :
      <OrderSettlementReader key={`${tenantId}:${outletId}`} ids={orders.map(order => order._id)}>{(payments, ready, ledgerError) => {
        if (!ready) return <Text style={styles.text}>{ledgerError ?? "Loading settlement history…"}</Text>;
        const result = summarizeStaffPerformance(orders, payments, period);
        return <View>{result.staff.map(row => <Text style={styles.text} key={row.staffUserId}>
          {nameOf(row.staffUserId)} · {row.saleCount} sales · {formatPeso(row.grossTotal)} · cash {formatPeso(row.cashTotal)} · other {formatPeso(row.nonCashTotal)} · average {formatPeso(row.averageTicket)}
        </Text>)}{result.unattributed.saleCount > 0 && <Text style={styles.text}>Unattributed · {formatPeso(result.unattributed.grossTotal)}</Text>}
          {result.staff.length === 0 && result.unattributed.saleCount === 0 && <Text style={styles.text}>No counter sales in this period.</Text>}</View>;
      }}</OrderSettlementReader>}
    <Text style={styles.title}>Shift history</Text>
    {history?.key !== key ? <Text style={styles.text}>Loading shifts…</Text> : history.error ? <Text style={styles.text}>{history.error}</Text> : history.rows.map(shift => {
      const rec = shift.expectedCash === null ? null : reconcileShift({ openingFloat: shift.openingFloat, cashCollected: shift.expectedCash - shift.openingFloat, countedCash: shift.closingCount });
      return <Text key={shift.id} style={styles.text}>{shift.staffName} · {new Date(shift.openedAt).toLocaleString()} · {shift.status}{rec ? ` · turnover ${formatPeso(rec.expectedTurnover)} · ${rec.verdict}${rec.variance ? ` ${formatPeso(Math.abs(rec.variance))}` : ""}` : ""}</Text>;
    })}
    {history?.key === key && !history.error && history.rows.length === 0 && <Text style={styles.text}>No shifts in this period.</Text>}
  </View>;
}
const styles = StyleSheet.create({ panel: { gap: spacing.sm, paddingVertical: spacing.md }, title: { fontSize: 16, fontWeight: "700", color: colors.textPrimary }, text: { color: colors.textSecondary, paddingVertical: 4 }, periods: { flexDirection: "row", gap: spacing.lg } });
