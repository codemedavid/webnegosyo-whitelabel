import React, { useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { FunctionReference } from "convex/server";

import { colors, radius, spacing, typography } from "../../../theme/colors";
import { useSafeQuery } from "../../../lib/hooks";
import { filterOrdersToScope } from "../../../lib/branch-scope";
import { useBranchScope } from "../../../lib/use-branch-scope";
import { useAuthStore } from "../../../stores/auth-store";
import { DEMO_READONLY_MESSAGE } from "../../../lib/demo";
import { formatPeso } from "../../../lib/format";
import { displayCustomerName } from "../../../lib/order-visuals";
import { getWebAppUrl } from "../../../lib/web-app-url";
import type { OrderDto } from "../../../lib/backends/supabase-orders";
import { buildTableViews, type TableView } from "../../../lib/tables/table-floor";
import { canClearTable, canSeat, formatSeatedFor } from "../../../lib/tables/table-actions";
import { tableStatusLabel } from "../../../lib/tables/table-copy";
import { buildTableMenuUrl } from "../../../lib/tables/table-qr";
import { useDiningTables, useOutletSlug, useTableWrites } from "../../../lib/tables/use-dining-tables";
import { BackHeader } from "../../../components/BackHeader";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { ListRow } from "../../../components/ListRow";
import { SectionHeader } from "../../../components/SectionHeader";
import { LoadingState } from "../../../components/LoadingState";
import { ErrorState } from "../../../components/ErrorState";
import { TickerProvider, useTickerNow } from "../../../components/TickerProvider";
import { PartyStepper } from "../../../components/tables/PartyStepper";
import { SeatPartySheet } from "../../../components/tables/SeatPartySheet";
import { TableQrCard } from "../../../components/tables/TableQrCard";
import { STATUS_TONES } from "../../../components/tables/floor-tokens";

const getOrdersRef = "orders:getOrders" as unknown as FunctionReference<"query">;
const ORDERS_FETCH_LIMIT = 200;
const TIMER_TICK_MS = 30_000;

export default function TableDetailScreen() {
  return (
    <TickerProvider intervalMs={TIMER_TICK_MS}>
      <TableDetail />
    </TickerProvider>
  );
}

function TableDetail() {
  const { tableId } = useLocalSearchParams<{ tableId: string }>();
  const nowMs = useTickerNow();
  const tenantSlug = useAuthStore((s) => s.tenantSlug);

  const { tables, seatings, isLoading, error, refetch } = useDiningTables();
  const writes = useTableWrites();
  const { data: orders } = useSafeQuery<OrderDto[]>(getOrdersRef, { limit: ORDERS_FETCH_LIMIT });
  const scope = useBranchScope();
  const [isSeating, setSeating] = useState(false);

  const table = useMemo(() => tables.find((entry) => entry.id === tableId) ?? null, [tables, tableId]);
  const outletSlug = useOutletSlug(table?.outletId ?? null);

  const view: TableView<OrderDto> | null = useMemo(() => {
    if (!table) return null;
    const scoped = (filterOrdersToScope(scope, orders) as OrderDto[] | undefined) ?? [];
    return buildTableViews<OrderDto>([table], seatings, scoped, nowMs)[0] ?? null;
  }, [table, seatings, orders, scope, nowMs]);

  const qrUrl = useMemo(
    () =>
      table && tenantSlug
        ? buildTableMenuUrl({ webAppUrl: getWebAppUrl(), tenantSlug, label: table.label, outletSlug })
        : null,
    [table, tenantSlug, outletSlug],
  );

  const guardDemo = (): boolean => {
    if (useAuthStore.getState().isDemo) {
      Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
      return true;
    }
    return false;
  };
  const report = (title: string, e: unknown) =>
    Alert.alert(title, e instanceof Error ? e.message : "Something went wrong. Try again.");

  const handleSeat = async (partySize: number, note: string) => {
    if (!view || guardDemo()) return;
    try {
      await writes.seat(view.table.id, partySize, note);
      setSeating(false);
    } catch (e: unknown) {
      report("Party not seated", e);
    }
  };

  const handlePartySize = async (partySize: number) => {
    if (!view?.seating || guardDemo()) return;
    try {
      await writes.setPartySize(view.seating.id, partySize);
    } catch (e: unknown) {
      report("Party size not changed", e);
    }
  };

  const handleClear = () => {
    if (!view?.seating || guardDemo()) return;
    const verdict = canClearTable(view);
    if (!verdict.allowed) {
      Alert.alert("Not yet", verdict.reason);
      return;
    }
    const seatingId = view.seating.id;
    const clear = async () => {
      try {
        await writes.clear(seatingId);
      } catch (e: unknown) {
        report("Table not cleared", e);
      }
    };
    if (verdict.confirm) {
      Alert.alert("Clear the table?", verdict.confirm, [
        { text: "Keep", style: "cancel" },
        { text: "Clear", style: "destructive", onPress: () => void clear() },
      ]);
      return;
    }
    void clear();
  };

  if (isLoading) {
    return (
      <View style={styles.screen}>
        <BackHeader title="Table" />
        <LoadingState message="Loading the table" />
      </View>
    );
  }
  if (error || !view) {
    return (
      <View style={styles.screen}>
        <BackHeader title="Table" />
        <ErrorState
          title={error ? "The table did not load" : "Table not found"}
          message={error ?? "It may have been removed from the floor."}
          onRetry={error ? () => void refetch() : () => router.back()}
        />
      </View>
    );
  }

  const tone = STATUS_TONES[view.status];
  const clearVerdict = canClearTable(view);

  return (
    <View style={styles.screen}>
      <BackHeader
        title={`Table ${view.table.label}`}
        subtitle={[view.table.zone, `${view.table.seats} seats`, tableStatusLabel(view.status)].filter(Boolean).join(" · ")}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.statusBanner, { backgroundColor: tone.fill, borderColor: tone.ring }]}>
          <Text style={[styles.statusText, { color: tone.ink }]}>{tableStatusLabel(view.status)}</Text>
          {view.seating ? (
            <Text style={[styles.statusMeta, { color: tone.ink }]}>
              {`${view.covers} ${view.covers === 1 ? "guest" : "guests"} · seated ${formatSeatedFor(view.seatedForMs ?? 0)}`}
            </Text>
          ) : (
            <Text style={[styles.statusMeta, { color: tone.ink }]}>Nobody seated</Text>
          )}
        </View>

        <SectionHeader title="Party" />
        <Card>
          {view.seating ? (
            <View style={styles.party}>
              <PartyStepper value={view.seating.partySize} seats={view.table.seats} onChange={(size) => void handlePartySize(size)} />
              {view.seating.note ? <Text style={styles.note}>{view.seating.note}</Text> : null}
              {clearVerdict.allowed ? (
                <Button label="Clear table" tone="danger" onPress={handleClear} fullWidth />
              ) : (
                <Text style={styles.reason}>{clearVerdict.reason}</Text>
              )}
            </View>
          ) : (
            <Button label="Seat a party" icon="customers" onPress={() => setSeating(true)} size="lg" fullWidth disabled={!canSeat(view)} />
          )}
        </Card>

        <SectionHeader title="Orders" hint={view.orders.length === 0 ? "Nothing on the table" : undefined} />
        {view.orders.length > 0 ? (
          <Card>
            <View style={styles.bill}>
              <View style={styles.billRow}>
                <Text style={styles.billLabel}>Running bill</Text>
                <Text style={styles.billValue}>{formatPeso(view.runningBill)}</Text>
              </View>
              {view.unpaidTotal > 0 ? (
                <View style={styles.billRow}>
                  <Text style={[styles.billLabel, styles.owed]}>Still owed</Text>
                  <Text style={[styles.billValue, styles.owed]}>{formatPeso(view.unpaidTotal)}</Text>
                </View>
              ) : null}
            </View>
            {view.orders.map((order) => (
              <ListRow
                key={order._id}
                title={order.dailyNumber != null ? `#${order.dailyNumber} · ${displayCustomerName(order.customerName)}` : displayCustomerName(order.customerName)}
                subtitle={`${order.status} · ${formatPeso(order.total)}${order.paymentStatus ? ` · ${order.paymentStatus}` : ""}`}
                icon="orders"
                tone={order.status === "ready" ? "accent" : "default"}
                onPress={() => router.push(`/(main)/order/${order._id}`)}
                grouped
              />
            ))}
          </Card>
        ) : null}

        {qrUrl ? (
          <>
            <SectionHeader title="Table code" hint="Print it, stand it on the table" />
            <TableQrCard label={view.table.label} url={qrUrl} />
          </>
        ) : null}
      </ScrollView>

      <SeatPartySheet
        view={view}
        visible={isSeating}
        onClose={() => setSeating(false)}
        onSeat={handleSeat}
        isSaving={writes.isSaving}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 96, gap: spacing.md },
  statusBanner: {
    borderRadius: radius.lg,
    borderWidth: 2,
    padding: spacing.lg,
    gap: 2,
  },
  statusText: { fontSize: 22, fontWeight: "800", letterSpacing: -0.3 },
  statusMeta: { ...typography.caption, fontWeight: "600" },
  party: { gap: spacing.md },
  note: { ...typography.caption, color: colors.textSecondary, fontStyle: "italic", textAlign: "center" },
  reason: { ...typography.caption, color: colors.textSecondary, textAlign: "center" },
  bill: { gap: spacing.xs, marginBottom: spacing.md },
  billRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  billLabel: { ...typography.caption, color: colors.textSecondary, fontWeight: "600" },
  billValue: { ...typography.heading, color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  owed: { color: colors.danger },
});
