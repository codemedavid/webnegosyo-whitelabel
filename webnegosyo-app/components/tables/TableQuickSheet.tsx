import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { ListRow } from "../ListRow";
import { formatPeso } from "../../lib/format";
import { displayCustomerName } from "../../lib/order-visuals";
import { canClearTable, canSeat, formatSeatedFor, singleAppendableOrder } from "../../lib/tables/table-actions";
import { tableStatusLabel } from "../../lib/tables/table-copy";
import type { TableOrderLike, TableView } from "../../lib/tables/table-floor";
import { FloorSheet } from "./FloorSheet";
import { PartyStepper } from "./PartyStepper";
import { STATUS_TONES } from "./floor-tokens";

export interface QuickSheetOrder extends TableOrderLike {
  customerName?: string;
  dailyNumber?: number | null;
}

interface TableQuickSheetProps {
  view: TableView<QuickSheetOrder> | null;
  visible: boolean;
  onClose: () => void;
  onSeat: (view: TableView) => void;
  onPartySize: (view: TableView, partySize: number) => void;
  onClear: (view: TableView) => void;
  onOpenOrder: (orderId: string) => void;
  onOpenTable: (view: TableView) => void;
  /** Absent until the register knows how to start a dine-in sale (Phase 8). */
  onNewOrder?: (view: TableView) => void;
  onAddItems?: (view: TableView, orderId: string) => void;
}

const MAX_ORDER_ROWS = 3;

/**
 * What a tap on a table shows: the party, the money, the last few orders,
 * and the one or two things the host does next.
 */
export function TableQuickSheet({
  view,
  visible,
  onClose,
  onSeat,
  onPartySize,
  onClear,
  onOpenOrder,
  onOpenTable,
  onNewOrder,
  onAddItems,
}: TableQuickSheetProps) {
  if (!view) return null;

  const tone = STATUS_TONES[view.status];
  const clearVerdict = canClearTable(view);
  const appendable = singleAppendableOrder(view);
  const rows = view.orders.slice(0, MAX_ORDER_ROWS);
  const hidden = view.orders.length - rows.length;

  return (
    <FloorSheet
      visible={visible}
      title={`Table ${view.table.label}`}
      subtitle={[view.table.zone, `${view.table.seats} seats`].filter(Boolean).join(" · ")}
      onClose={onClose}
      accessory={
        <View style={[styles.statusPill, { backgroundColor: tone.fill, borderColor: tone.ring }]}>
          <Text style={[styles.statusText, { color: tone.ink }]}>{tableStatusLabel(view.status)}</Text>
        </View>
      }
      footer={
        <>
          {onNewOrder ? (
            <Button label="New order" icon="register" onPress={() => onNewOrder(view)} size="lg" fullWidth />
          ) : null}
          {onAddItems && appendable ? (
            <Button
              label="Add items to the order"
              icon="plus"
              tone="secondary"
              onPress={() => onAddItems(view, appendable._id)}
              size="lg"
              fullWidth
            />
          ) : null}
          {canSeat(view) ? (
            <Button label="Seat a party" icon="customers" tone={onNewOrder ? "secondary" : "primary"} onPress={() => onSeat(view)} size="lg" fullWidth />
          ) : null}
          <View style={styles.footerRow}>
            <Button label="Open table" icon="chevron" tone="ghost" onPress={() => onOpenTable(view)} style={styles.grow} />
            {clearVerdict.allowed ? (
              <Button label="Clear table" tone="danger" onPress={() => onClear(view)} style={styles.grow} />
            ) : null}
          </View>
          {!clearVerdict.allowed && (view.seating || view.orders.length > 0) ? (
            <Text style={styles.reason}>{clearVerdict.reason}</Text>
          ) : null}
        </>
      }
    >
      {view.seating ? (
        <View style={styles.party}>
          <View style={styles.partyHeader}>
            <Text style={styles.partyTitle}>Party</Text>
            <Text style={styles.partyTimer}>
              Seated {formatSeatedFor(view.seatedForMs ?? 0)}
            </Text>
          </View>
          <PartyStepper
            value={view.seating.partySize}
            seats={view.table.seats}
            onChange={(size) => onPartySize(view, size)}
          />
          {view.seating.note ? <Text style={styles.note}>{view.seating.note}</Text> : null}
        </View>
      ) : null}

      {view.orders.length > 0 ? (
        <View style={styles.orders}>
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
          {rows.map((order) => (
            <ListRow
              key={order._id}
              title={orderTitle(order)}
              subtitle={`${order.status} · ${formatPeso(order.total)}`}
              icon="orders"
              tone={order.status === "ready" ? "accent" : "default"}
              onPress={() => onOpenOrder(order._id)}
              grouped
            />
          ))}
          {hidden > 0 ? <Text style={styles.more}>{`${hidden} more on the table page`}</Text> : null}
        </View>
      ) : (
        <Text style={styles.quiet}>
          {view.seating ? "Nothing ordered yet." : "Nobody is seated here."}
        </Text>
      )}
    </FloorSheet>
  );
}

function orderTitle(order: QuickSheetOrder): string {
  const who = displayCustomerName(order.customerName);
  return order.dailyNumber != null ? `#${order.dailyNumber} · ${who}` : who;
}

const styles = StyleSheet.create({
  statusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.full, borderWidth: 1.5 },
  statusText: { ...typography.small, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6 },
  party: { gap: spacing.md, paddingVertical: spacing.sm },
  partyHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  partyTitle: { ...typography.heading, color: colors.textPrimary },
  partyTimer: { ...typography.caption, color: colors.textSecondary, fontWeight: "600", fontVariant: ["tabular-nums"] },
  note: { ...typography.caption, color: colors.textSecondary, fontStyle: "italic", textAlign: "center" },
  orders: { gap: spacing.sm },
  billRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingHorizontal: spacing.xs },
  billLabel: { ...typography.caption, color: colors.textSecondary, fontWeight: "600" },
  billValue: { ...typography.heading, color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  owed: { color: colors.danger },
  more: { ...typography.small, color: colors.textSecondary, textAlign: "center", marginTop: spacing.xs },
  quiet: { ...typography.body, color: colors.textSecondary, textAlign: "center", paddingVertical: spacing.lg },
  footerRow: { flexDirection: "row", gap: spacing.sm },
  grow: { flex: 1 },
  reason: { ...typography.small, color: colors.textSecondary, textAlign: "center" },
});
