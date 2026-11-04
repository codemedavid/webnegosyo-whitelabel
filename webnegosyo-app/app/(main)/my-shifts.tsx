import React, { useCallback, useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { useAuthStore } from "../../stores/auth-store";
import { BackHeader } from "../../components/BackHeader";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { useShiftReportPrint } from "../../components/shift-sales/use-shift-report-print";
import { resourceKey } from "../../lib/backends/query-keys";
import { myShiftSalesHref } from "../../lib/cash-routes";
import { myShiftRow, printableReport, printStateText, type MyShiftRow } from "../../lib/cash/shift-report-actions";
import { fetchShiftNets, type ShiftNet } from "../../lib/cash/shift-nets";
import { fetchShiftSales } from "../../lib/cash/shift-sales";
import { toBusinessDayKey } from "../../lib/daily-report/business-day";
import { useResource } from "../../lib/query/use-resource";
import { refreshWithMinSpinner } from "../../lib/query/pull-to-refresh";
import { listShifts, type ShiftRecord } from "../../lib/shift-service";
import { colors, radius, spacing, typography } from "../../theme/colors";

/** Her last shifts, as many as one report_shift_nets call answers for. */
const MY_SHIFTS_LIMIT = 30;
const MY_SHIFTS_STALE_MS = 30_000;
const RESOURCE = "my-shifts";

/**
 * My shifts: the signed-in person's own last 30 shifts — the day, the hours
 * and her net — each with View (the Shift sales screen on her own sales) and
 * Reprint (her SHIFT REPORT straight to the receipt printer). staff_shifts
 * RLS lets a cashier read the shifts of her branch; this list asks for hers
 * only, and report_shift_nets answers only for shifts she held.
 */
export default function MyShiftsScreen() {
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const userId = useAuthStore((s) => s.userId);
  const isDemo = useAuthStore((s) => s.isDemo);
  const orderBackend = useAuthStore((s) => s.orderBackend);
  const printer = useShiftReportPrint();
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const isReading = !isDemo && tenantId !== null && userId !== null;
  const listFetcher = useCallback(
    () => listShifts(tenantId as string, { staffUserId: userId as string, limit: MY_SHIFTS_LIMIT }),
    [tenantId, userId],
  );
  const list = useResource<ShiftRecord[]>(isReading ? resourceKey(RESOURCE, tenantId, userId, "list") : null, listFetcher, {
    staleTime: MY_SHIFTS_STALE_MS,
  });
  const ids = useMemo(() => (list.data ?? []).map((shift) => shift.id), [list.data]);
  const netsFetcher = useCallback(async () => {
    const result = await fetchShiftNets(ids);
    // A database without report_shift_nets yet: rows say "See report", never ₱0.
    return result.ok ? result.value : new Map<string, ShiftNet>();
  }, [ids]);
  const nets = useResource<ReadonlyMap<string, ShiftNet>>(
    isReading && orderBackend === "platform" && ids.length > 0 ? resourceKey(RESOURCE, tenantId, userId, "nets", ids.join(",")) : null,
    netsFetcher,
    { staleTime: MY_SHIFTS_STALE_MS },
  );

  const nowIso = new Date().toISOString();
  const rows = useMemo<MyShiftRow[]>(
    () =>
      (list.data ?? []).map((shift) =>
        myShiftRow(shift, nets.data?.get(shift.id), { nowIso, isLoading: nets.isLoading, dayKeyOf: toBusinessDayKey }),
      ),
    // nowIso moves every render; the day labels only need it per read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [list.data, nets.data, nets.isLoading],
  );

  const reprint = async (shiftId: string) => {
    if (orderBackend !== "platform") {
      router.push(myShiftSalesHref(shiftId) as never);
      return;
    }
    setPrintingId(shiftId);
    try {
      const fetched = await fetchShiftSales(shiftId, undefined, "cashier");
      const report = printableReport(fetched);
      if (!report) {
        router.push(myShiftSalesHref(shiftId) as never);
        return;
      }
      await printer.print(report);
    } finally {
      setPrintingId(null);
    }
  };

  const refresh = () => refreshWithMinSpinner([list.refetch, nets.refetch], setIsRefreshing);
  const status = printStateText(printer.state);

  if (isDemo) {
    return (
      <Frame>
        <EmptyState icon="clock" title="No shifts in the demo" message="Your past shifts show here, each with its shift report." inset />
      </Frame>
    );
  }
  if (list.isLoading) {
    return (
      <Frame>
        <LoadingState message="Getting your shifts…" />
      </Frame>
    );
  }
  if (list.error && !list.data) {
    return (
      <Frame>
        <ErrorState title="Your shifts couldn't load" message={list.error} onRetry={() => void list.refetch()} />
      </Frame>
    );
  }

  return (
    <Frame>
      {status ? (
        <Text
          style={[styles.status, printer.state.status === "failed" && styles.failed]}
          accessibilityLiveRegion="polite"
          testID="my-shifts-status"
        >
          {status}
        </Text>
      ) : null}
      <FlatList
        data={rows}
        keyExtractor={(row) => row.id}
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void refresh()} />}
        ListEmptyComponent={<EmptyState icon="clock" title="No shifts yet" message="Clock in on the Drawer to start your first shift." inset />}
        renderItem={({ item }) => (
          <ShiftRowCard
            row={item}
            isPrinting={printingId === item.id}
            isBusy={printingId !== null}
            onView={() => router.push(myShiftSalesHref(item.id) as never)}
            onReprint={() => void reprint(item.id)}
          />
        )}
      />
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.screen}>
      <BackHeader title="My shifts" subtitle="Your last 30 shifts and their reports" />
      {children}
    </View>
  );
}

interface ShiftRowCardProps {
  row: MyShiftRow;
  isPrinting: boolean;
  isBusy: boolean;
  onView: () => void;
  onReprint: () => void;
}

function ShiftRowCard({ row, isPrinting, isBusy, onView, onReprint }: ShiftRowCardProps) {
  return (
    <View style={styles.card} testID={`my-shift-${row.id}`} accessible accessibilityLabel={`${row.day}, ${row.times}, ${row.net}`}>
      <View style={styles.head}>
        <Text style={styles.day}>{row.day}</Text>
        {row.isOpen ? (
          <View style={styles.live}>
            <Text style={styles.liveText}>Open now</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.times}>{row.times}</Text>
      <Text style={styles.net}>{row.net}</Text>
      <View style={styles.actions}>
        <Button label="View" icon="report" tone="secondary" fullWidth={false} style={styles.action} onPress={onView} />
        <Button
          label="Reprint"
          icon="printer"
          tone="secondary"
          fullWidth={false}
          style={styles.action}
          onPress={onReprint}
          isLoading={isPrinting}
          disabled={isBusy && !isPrinting}
          accessibilityHint="Prints this shift's report: your sales, items sold and voids"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { padding: spacing.xl, paddingTop: 0, paddingBottom: spacing.xxl * 2, gap: spacing.md, maxWidth: 720, width: "100%", alignSelf: "center" },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.separator, padding: spacing.lg, gap: spacing.xs },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  day: { ...typography.heading, color: colors.textPrimary },
  live: { backgroundColor: colors.successLight, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  liveText: { ...typography.small, fontWeight: "800", color: colors.success },
  times: { ...typography.caption, color: colors.textMuted },
  net: { ...typography.body, fontWeight: "700", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  action: { flex: 1 },
  status: { ...typography.caption, fontWeight: "600", color: colors.textMuted, paddingHorizontal: spacing.xl, paddingBottom: spacing.sm },
  failed: { color: colors.danger },
});
