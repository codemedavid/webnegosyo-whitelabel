import React, { useCallback, useMemo, useState } from "react";
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { useAuthStore } from "../../stores/auth-store";
import { BackHeader } from "../../components/BackHeader";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { OfflineOrdersNotice } from "../../components/OfflineOrdersNotice";
import { OrderSettlementReader, type StaffPayment } from "../../components/OrderSettlementReader";
import { SegmentedControl } from "../../components/SegmentedControl";
import { useIsWideReports } from "../../components/reports/ReportsColumns";
import { ShiftSalesBody, ShiftSalesSkeleton, type ShiftSalesLens } from "../../components/shift-sales/ShiftSalesBody";
import { canManageCash } from "../../lib/cash-drawers";
import { useServicePeriods } from "../../lib/cash/use-cash-rules";
import { DEMO_READONLY_MESSAGE } from "../../lib/demo";
import { refreshWithMinSpinner } from "../../lib/query/pull-to-refresh";
import { summarizeShiftDrawer } from "../../lib/shift-drawer";
import type { ShiftDetail } from "../../lib/shift-service";
import { countShiftSalesOnDevice, DEVICE_TOO_MANY_MESSAGE, type DeviceSalesOrder } from "../../lib/cash/shift-sales-fallback";
import { useDeviceShiftOrders, useServerShiftSales, useShiftDetail, type DeviceShiftOrders } from "../../lib/cash/shift-sales-hooks";
import { printShiftReport, shareShiftReport } from "../../lib/cash/shift-sales-print";
import { sampleShiftSales } from "../../lib/cash/shift-sales-sample";
import {
  needsDeviceCount,
  parseShiftSalesTarget,
  resolvePeriodName,
  resolveShiftSalesState,
  type DeviceSalesRead,
  type ShiftSalesScreenState,
  type ShiftSalesTarget,
} from "../../lib/cash/shift-sales-state";
import { drawerLens, HIDDEN_TITLE, shiftSalesSubtitle, shiftSalesTitle, type DrawerLens } from "../../lib/cash/shift-sales-view";
import type { ShiftSalesShift } from "../../lib/cash/shift-sales";
import { colors, spacing } from "../../theme/colors";

const LENSES: readonly { label: string; value: ShiftSalesLens }[] = [
  { label: "Store sales", value: "store" },
  { label: "My drawer", value: "drawer" },
];

const MINUTE_MS = 60_000;
const DRAWER_ROUTE = "/(main)/pos-sales";
const NOT_FOUND_MESSAGE = "This shift isn't here. It may belong to a branch this account can't see.";
/** The demo's "My drawer" — matches the sample report's cash and non-cash. */
const SAMPLE_DRAWER: DrawerLens = { cashCents: 81_000, nonCashCents: 274_000, changeCents: 12_500, refundCents: 0, sales: 9 };

/**
 * The end of an open shift's window, moved on once a minute so the order
 * read's arguments stay put between renders (a new `endMs` each render would
 * re-subscribe every time).
 */
function nextMinute(nowMs: number): number {
  return Math.ceil(nowMs / MINUTE_MS) * MINUTE_MS + MINUTE_MS;
}

function windowOf(target: ShiftSalesTarget | null, shift: ShiftDetail | null | undefined): { fromMs: number; toMs: number } | null {
  if (target?.kind === "period") return { fromMs: target.fromMs, toMs: target.toMs };
  if (!shift) return null;
  return { fromMs: Date.parse(shift.openedAt), toMs: shift.closedAt ? Date.parse(shift.closedAt) + 1 : nextMinute(Date.now()) };
}

function headerShift(shift: ShiftDetail): ShiftSalesShift {
  return {
    id: shift.id,
    staffName: shift.staffName,
    drawerName: shift.drawerName,
    openedAt: shift.openedAt,
    closedAt: shift.closedAt,
    businessDay: shift.businessDay,
    servicePeriodName: null,
  };
}

/**
 * Shift sales (P1): what the store sold in one shift — net sales, the
 * receipts' #range, discounts and voids, what is still unpaid, how it was
 * paid, order types, items and every receipt — so a cashier stops
 * hand-counting the stack. `?shift=<id>` for a clocked-in shift (live while
 * open), `?from&to&period&outlet` for a past named service period.
 */
export default function ShiftSalesScreen() {
  const params = useLocalSearchParams<{ shift?: string; from?: string; to?: string; period?: string; outlet?: string }>();
  const target = useMemo(
    () => parseShiftSalesTarget(params),
    // The params object is new every render; its values decide the target.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params.shift, params.from, params.to, params.period, params.outlet],
  );
  const isDemo = useAuthStore((s) => s.isDemo);
  const orderBackend = useAuthStore((s) => s.orderBackend);
  const [lens, setLens] = useState<ShiftSalesLens>("store");

  const shiftRead = useShiftDetail(!isDemo && target?.kind === "shift" ? target.shiftId : null);
  const server = useServerShiftSales(target, !isDemo && orderBackend === "platform");
  const window = windowOf(target, shiftRead.data);
  const wantsDevice = !isDemo && (needsDeviceCount(server.read) || (lens === "drawer" && target?.kind === "shift"));
  const device = useDeviceShiftOrders(window, wantsDevice && window !== null);
  const windowIds = useMemo(
    () => (window ? (device.orders ?? []).filter((o) => o._creationTime >= window.fromMs && o._creationTime < window.toMs).map((o) => o._id) : []),
    [device.orders, window?.fromMs, window?.toMs], // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (!target) {
    return (
      <View style={styles.screen}>
        <BackHeader title="Shift sales" />
        <EmptyState icon="info" title="No shift chosen" message="Open Shift sales from the Drawer or from a shift in the history." inset />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <OrderSettlementReader ids={windowIds}>
        {(payments, ready, error) => (
          <ShiftSalesContent
            target={target}
            lens={lens}
            onLens={setLens}
            shiftRead={shiftRead}
            server={server}
            device={device}
            window={window}
            wantsDevice={wantsDevice}
            ledger={{ payments, ready, error }}
          />
        )}
      </OrderSettlementReader>
    </View>
  );
}

interface ContentProps {
  target: ShiftSalesTarget;
  lens: ShiftSalesLens;
  onLens: (lens: ShiftSalesLens) => void;
  shiftRead: ReturnType<typeof useShiftDetail>;
  server: ReturnType<typeof useServerShiftSales>;
  device: DeviceShiftOrders;
  window: { fromMs: number; toMs: number } | null;
  wantsDevice: boolean;
  ledger: { payments: StaffPayment[]; ready: boolean; error: string | null };
}

/** Why the tablet cannot count yet, or the count itself. */
function readDevice(props: ContentProps, hidden: boolean): DeviceSalesRead {
  const { target, shiftRead, device, window, wantsDevice, ledger } = props;
  if (!wantsDevice) return { status: "idle" };
  if (target.kind === "shift") {
    if (shiftRead.isLoading) return { status: "loading" };
    if (shiftRead.error) return { status: "unavailable", reason: shiftRead.error };
    if (!shiftRead.data) return { status: "unavailable", reason: NOT_FOUND_MESSAGE };
  }
  if (!window) return { status: "loading" };
  if (!device.orders) return device.error ? { status: "unavailable", reason: device.error } : { status: "loading" };
  if (!device.isComplete) return { status: "unavailable", reason: DEVICE_TOO_MANY_MESSAGE };
  if (ledger.error) return { status: "unavailable", reason: `Payments taken couldn't be read (${ledger.error}).` };
  if (!ledger.ready) return { status: "loading" };
  const shift = shiftRead.data ?? null;
  const outletId = target.kind === "period" ? target.outletId : shift?.outletId;
  return {
    status: "ready",
    report: countShiftSalesOnDevice({
      orders: device.orders,
      payments: ledger.payments,
      fromMs: window.fromMs,
      toMs: window.toMs,
      // No branch on the shift or the link = the whole store.
      outletId: outletId ?? undefined,
      shift: shift ? headerShift(shift) : null,
      hidden,
    }),
  };
}

/** "My drawer": this cashier's own takings, from the Drawer's one drawer rule. */
function readDrawerLens(props: ContentProps, hidden: boolean, isDemo: boolean): { lens: DrawerLens | null; pendingText: string | null } {
  if (isDemo) return { lens: SAMPLE_DRAWER, pendingText: null };
  if (hidden) return { lens: null, pendingText: HIDDEN_TITLE };
  const shift = props.shiftRead.data;
  const { device, ledger } = props;
  if (!shift || !device.orders || !ledger.ready) return { lens: null, pendingText: ledger.error ?? device.error ?? "Adding up…" };
  if (!device.isComplete) return { lens: null, pendingText: DEVICE_TOO_MANY_MESSAGE };
  const summary = summarizeShiftDrawer(
    device.orders as DeviceSalesOrder[],
    ledger.payments,
    { outletId: shift.outletId, staffUserId: shift.staffUserId ?? "", openedAt: shift.openedAt, closedAt: shift.closedAt },
    Date.now(),
  );
  return { lens: drawerLens(summary), pendingText: null };
}

function ShiftSalesContent(props: ContentProps) {
  const { target, lens, onLens, shiftRead, server, device } = props;
  const isDemo = useAuthStore((s) => s.isDemo);
  const userId = useAuthStore((s) => s.userId);
  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);
  const storeName = useAuthStore((s) => s.tenantName) ?? "Store";
  const outletName = useAuthStore((s) => s.outletName) ?? undefined;
  const isWide = useIsWideReports();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const sample = useMemo(() => (isDemo ? sampleShiftSales(Date.now()) : null), [isDemo]);
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  // Reports → Shifts links a named shift by id; its name is the title.
  const periods = useServicePeriods(!isDemo && target.kind === "period" && target.periodId ? tenantId : null);

  const shift = shiftRead.data ?? null;
  const canManage = canManageCash({ role, isOwner, permissions });
  // Decision 9: blind + still open + not a cash manager = counts, no pesos.
  const hidden = shift !== null && shift.isBlind && shift.status === "open" && !canManage;
  const state: ShiftSalesScreenState = resolveShiftSalesState({ sample, server: server.read, device: readDevice(props, hidden) });
  const report = state.kind === "ready" ? state.report : null;
  const isOpen = report?.shift ? report.shift.closedAt === null : shift?.status === "open";
  const isMine = shift !== null && shift.staffUserId === userId;
  const periodName = resolvePeriodName(target, periods.data);
  const title = shiftSalesTitle(report?.shift ?? (shift ? headerShift(shift) : null), periodName);
  const subtitle = report ? shiftSalesSubtitle(report, new Date().toISOString(), null) : undefined;

  const refresh = useCallback(
    () => refreshWithMinSpinner([server.refetch, shiftRead.refetch, device.refetch], setIsRefreshing),
    [server.refetch, shiftRead.refetch, device.refetch],
  );

  const print = async () => {
    if (!report) return;
    if (isDemo) {
      Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
      return;
    }
    setIsPrinting(true);
    try {
      const outcome = await printShiftReport(report, storeName, outletName);
      if (!outcome.ok) Alert.alert("Couldn't print", outcome.message);
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <>
      <BackHeader title={`${title} sales`} subtitle={subtitle} />
      {target.kind === "shift" ? (
        <View style={styles.toolbar}>
          <SegmentedControl options={LENSES} value={lens} onChange={onLens} accessibilityPrefix="Show" />
        </View>
      ) : null}
      <OfflineOrdersNotice isOffline={device.isOffline} savedAt={device.savedAt} />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
      >
        {state.kind === "loading" ? <ShiftSalesSkeleton /> : null}
        {state.kind === "locked" ? <EmptyState icon="lock" title="Not your shift" message={state.message} inset /> : null}
        {state.kind === "unavailable" ? <EmptyState icon="info" title="Can't add this shift up here" message={state.message} inset /> : null}
        {state.kind === "error" ? <ErrorState title="Shift sales couldn't load" message={state.message} onRetry={() => void refresh()} /> : null}
        {report ? (
          <ShiftSalesBody
            report={report}
            title={title}
            isOpen={isOpen}
            isWide={isWide}
            lens={target.kind === "shift" ? lens : "store"}
            drawer={readDrawerLens(props, hidden, isDemo)}
            notice={state.kind === "ready" ? (state.notice ?? server.staleNotice) : null}
            onOpenReceipt={isDemo ? undefined : (orderId) => router.push(`/(main)/order/${orderId}` as never)}
            onPrint={() => void print()}
            onShare={() => void shareShiftReport(report, storeName, outletName)}
            isPrinting={isPrinting}
            // Until the End shift & remit flow lands, its door is the Drawer's End shift.
            onEndShift={isMine && isOpen ? () => router.push(DRAWER_ROUTE as never) : undefined}
          />
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  toolbar: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  body: { padding: spacing.xl, paddingTop: 0, paddingBottom: spacing.xxl * 2 },
});
