import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { formatPeso } from "../../lib/expenses/keypad";
import { paidByRows, type DrawerLens } from "../../lib/cash/shift-sales-view";
import type { ShiftSalesBreakdown, ShiftSalesItem, ShiftSalesPayment } from "../../lib/cash/shift-sales";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { BigAmount } from "../BigAmount";
import { Icon } from "../Icon";
import { card, ink } from "./shift-sales-styles";

/** "Paid by": one row per method with a bar, the amount, how many payments and the share in words. */
export function PaidByCard({ payments }: { payments: readonly ShiftSalesPayment[] }) {
  const rows = paidByRows(payments);
  return (
    <View style={card.card} testID="shift-sales-paid-by">
      <View style={card.head}>
        <Text style={card.title}>Paid by</Text>
        <Text style={card.hint}>Money received</Text>
      </View>
      {rows.length === 0 ? <Text style={card.meta}>No payments received yet.</Text> : null}
      {rows.map((row) => (
        <View key={row.key} style={styles.payRow} accessible accessibilityLabel={`${row.label}, ${row.amount}, ${row.meta}${row.share ? `, ${row.share}` : ""}`}>
          <View style={styles.payTop}>
            <Text style={card.label} numberOfLines={1}>
              {row.label}
            </Text>
            <Text style={card.money}>{row.amount}</Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.bar, { width: `${Math.round(row.fraction * 100)}%` }]} />
          </View>
          <Text style={card.meta}>{row.share ? `${row.meta} · ${row.share}` : row.meta}</Text>
        </View>
      ))}
    </View>
  );
}

/** Order types (or channels): orders and net sales per row. */
export function BreakdownCard({ title, rows }: { title: string; rows: readonly ShiftSalesBreakdown[] }) {
  if (rows.length === 0) return null;
  return (
    <View style={card.card}>
      <Text style={card.title}>{title}</Text>
      {rows.map((row) => (
        <View key={row.key} style={card.row}>
          <Text style={card.label} numberOfLines={1}>
            {row.label}
          </Text>
          <Text style={card.meta}>{`${row.orders} ${row.orders === 1 ? "order" : "orders"}`}</Text>
          <Text style={card.money}>{formatPeso(row.netCents)}</Text>
        </View>
      ))}
    </View>
  );
}

const ITEMS_FOLDED = 5;

/** Top items, folded to five until asked. */
export function TopItemsCard({ items }: { items: readonly ShiftSalesItem[] }) {
  const [isOpen, setIsOpen] = useState(false);
  if (items.length === 0) return null;
  const shown = isOpen ? items : items.slice(0, ITEMS_FOLDED);
  const hasMore = items.length > ITEMS_FOLDED;
  return (
    <View style={card.card}>
      <Text style={card.title}>Top items</Text>
      {shown.map((item, index) => (
        <View key={`${item.label}:${index}`} style={card.row}>
          <Text style={styles.rank}>{index + 1}</Text>
          <Text style={card.label} numberOfLines={1}>
            {item.label}
          </Text>
          <Text style={card.meta}>{`× ${Number.isInteger(item.quantity) ? item.quantity : item.quantity.toFixed(2)}`}</Text>
          <Text style={card.money}>{formatPeso(item.netCents)}</Text>
        </View>
      ))}
      {hasMore ? (
        <TouchableOpacity
          style={styles.more}
          onPress={() => setIsOpen((open) => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded: isOpen }}
        >
          <Text style={styles.moreText}>{isOpen ? "Show fewer" : `Show all ${items.length}`}</Text>
          <Icon name="chevron" size={14} color={colors.textPrimary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

interface DrawerLensCardProps {
  lens: DrawerLens | null;
  /** Why the lens has no figures (loading, too many orders, hidden). */
  pendingText: string | null;
}

/** "My drawer": the money THIS cashier took — cash in the drawer vs everything else. */
export function DrawerLensCard({ lens, pendingText }: DrawerLensCardProps) {
  return (
    <View style={ink.hero} testID="shift-sales-drawer">
      <Text style={ink.eyebrow}>Cash you took this shift</Text>
      {lens ? <BigAmount cents={lens.cashCents} color={colors.heroInkText} /> : <Text style={ink.pending}>{pendingText}</Text>}
      {lens ? (
        <View style={ink.lines}>
          <DrawerLine label="GCash, card and other non-cash" value={formatPeso(lens.nonCashCents)} />
          <DrawerLine label="Change handed out" value={formatPeso(lens.changeCents)} />
          {lens.refundCents > 0 ? <DrawerLine label="Handed back" value={formatPeso(lens.refundCents)} /> : null}
          <DrawerLine label="Sales you rang up" value={String(lens.sales)} />
        </View>
      ) : null}
      <Text style={ink.muted}>What should be in the drawer, with pay-ins and pickups, is on the Drawer screen.</Text>
    </View>
  );
}

function DrawerLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={ink.line}>
      <Text style={ink.muted}>{label}</Text>
      <Text style={ink.lineValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  payRow: { gap: 6, minHeight: 48 },
  payTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  track: { height: 8, borderRadius: radius.full, backgroundColor: colors.surfaceSubtle, overflow: "hidden" },
  bar: { height: 8, borderRadius: radius.full, backgroundColor: colors.primary },
  rank: { ...typography.caption, fontWeight: "800", color: colors.textMuted, width: 20, fontVariant: ["tabular-nums"] },
  more: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, minHeight: 48 },
  moreText: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
});
