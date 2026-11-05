import React from "react";
import { FlatList, StyleSheet, Text, View, type ListRenderItem, type RefreshControlProps } from "react-native";

import { Button } from "../Button";
import { EmptyState } from "../EmptyState";
import { ErrorState } from "../ErrorState";
import { formatPeso } from "../../lib/format";
import {
  ITEM_SUMMARY_PLATFORM_ONLY_MESSAGE,
  UNRECORDED_ITEM_DETAIL,
  itemSummaryNotes,
  type ItemSummary,
  type ItemSummaryRow,
} from "../../lib/reports/item-summary";
import type { ItemSummaryViewState } from "../../lib/reports/use-item-summary";
import { colors, radius, spacing, typography } from "../../theme/colors";

interface ItemSummaryPanelProps {
  state: ItemSummaryViewState;
  /** "Today", "Oct 29 – Nov 4": what the period bar names. */
  periodLabel: string;
  isPrinting: boolean;
  onRetry: () => void;
  onPrint: () => void;
  onShare: () => void;
  /** The screen's own header (title, period bar, toggle); scrolls with the rows. */
  header?: React.ReactElement;
  refreshControl?: React.ReactElement<RefreshControlProps>;
}

const QTY_WIDTH = 56;
const NET_MIN_WIDTH = 104;

function money(cents: number): string {
  return formatPeso(cents / 100);
}

function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString("en-PH")} ${count === 1 ? one : many}`;
}

const keyExtractor = (row: ItemSummaryRow) => row.key;

const renderRow: ListRenderItem<ItemSummaryRow> = ({ item: row }) => (
  <View style={styles.row} accessible accessibilityLabel={`${row.label}: ${row.isUnrecorded ? "" : `${row.quantity} sold, `}${money(row.netCents)}`}>
    <View style={styles.nameCell}>
      <Text style={[styles.name, row.isUnrecorded && styles.nameMuted]} numberOfLines={2}>
        {row.label}
      </Text>
      {row.isUnrecorded ? <Text style={styles.detail}>{UNRECORDED_ITEM_DETAIL}</Text> : null}
    </View>
    <Text style={[styles.qty, styles.figure]}>{row.isUnrecorded ? "—" : row.quantity.toLocaleString("en-PH")}</Text>
    <Text style={[styles.net, styles.figure]}>{money(row.netCents)}</Text>
  </View>
);

function SummaryHead({
  summary,
  periodLabel,
  staleNotice,
  isPrinting,
  onPrint,
  onShare,
}: {
  summary: ItemSummary;
  periodLabel: string;
  staleNotice?: string | null;
  isPrinting: boolean;
  onPrint: () => void;
  onShare: () => void;
}) {
  const notes = itemSummaryNotes(summary);
  return (
    <View style={styles.head}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>Net sales</Text>
        <Text style={styles.heroFigure}>{money(summary.netCents)}</Text>
        <Text style={styles.heroMeta}>{`${plural(summary.orders, "order", "orders")} · ${periodLabel}`}</Text>
        <View style={styles.actions}>
          <Button label="Print" icon="printer" tone="secondary" fullWidth={false} onPress={onPrint} isLoading={isPrinting} />
          <Button label="Share" icon="export" tone="secondary" fullWidth={false} onPress={onShare} />
        </View>
      </View>
      {staleNotice ? <Text style={styles.notice}>{staleNotice}</Text> : null}
      {notes.map((note) => (
        <Text key={note} style={styles.notice}>
          {note}
        </Text>
      ))}
      <View style={styles.columns}>
        <Text style={[styles.columnLabel, styles.nameCell]}>Item</Text>
        <Text style={[styles.columnLabel, styles.qty]}>Qty</Text>
        <Text style={[styles.columnLabel, styles.net]}>Net sales</Text>
      </View>
    </View>
  );
}

function SummarySkeleton() {
  return (
    <View style={styles.head} accessible accessibilityRole="progressbar" accessibilityLabel="Adding up the items sold">
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>Net sales</Text>
        <Text style={styles.pending}>Adding up…</Text>
      </View>
      {[0, 1, 2, 3].map((key) => (
        <View key={key} style={styles.ghostRow} />
      ))}
    </View>
  );
}

function TotalsBar({ summary }: { summary: ItemSummary }) {
  const net = money(summary.netCents);
  return (
    <View
      style={styles.totals}
      testID="item-summary-total"
      accessible
      accessibilityLabel={`Total: ${summary.quantity.toLocaleString("en-PH")} sold, net sales ${net}`}
    >
      <Text style={[styles.totalLabel, styles.nameCell]}>Total</Text>
      <Text style={[styles.totalFigure, styles.qty, styles.figure]}>{summary.quantity.toLocaleString("en-PH")}</Text>
      <Text style={[styles.totalFigure, styles.net, styles.figure]}>{net}</Text>
    </View>
  );
}

/**
 * Order History's item summary: Item · Qty · Net sales, highest first, with
 * the totals row pinned to the bottom of the screen. The total is the period's
 * net sales from the server; the panel never adds anything up.
 */
export function ItemSummaryPanel({
  state,
  periodLabel,
  isPrinting,
  onRetry,
  onPrint,
  onShare,
  header,
  refreshControl,
}: ItemSummaryPanelProps) {
  const summary = state.kind === "ready" ? state.summary : null;
  const rows = summary?.rows ?? [];
  const hasRows = rows.length > 0;

  const body = (() => {
    if (state.kind === "loading") return <SummarySkeleton />;
    if (state.kind === "error") return <ErrorState title="Item summary couldn't load" message={state.message} onRetry={onRetry} />;
    if (state.kind === "unavailable") {
      return <EmptyState icon="info" title="Not on this store yet" message={ITEM_SUMMARY_PLATFORM_ONLY_MESSAGE} inset />;
    }
    if (!hasRows || !summary) return <EmptyState icon="receipt" title="No sales in this period" message="Pick other days to see what sold." inset />;
    return (
      <SummaryHead
        summary={summary}
        periodLabel={periodLabel}
        staleNotice={state.kind === "ready" ? state.staleNotice : null}
        isPrinting={isPrinting}
        onPrint={onPrint}
        onShare={onShare}
      />
    );
  })();

  return (
    <View style={styles.screen}>
      <FlatList
        data={hasRows ? rows : []}
        keyExtractor={keyExtractor}
        renderItem={renderRow}
        ListHeaderComponent={
          <>
            {header}
            <View style={styles.bodyInset}>{body}</View>
          </>
        }
        contentContainerStyle={styles.listContent}
        refreshControl={refreshControl}
        keyboardShouldPersistTaps="handled"
      />
      {summary && hasRows ? <TotalsBar summary={summary} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  listContent: { paddingBottom: spacing.xl },
  bodyInset: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  head: { gap: spacing.md },
  hero: {
    backgroundColor: colors.heroInk,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  eyebrow: { ...typography.eyebrow, color: colors.heroInkMuted },
  heroFigure: { ...typography.title, fontSize: 30, color: colors.heroInkText, fontVariant: ["tabular-nums"] },
  heroMeta: { ...typography.caption, color: colors.heroInkMuted },
  pending: { ...typography.heading, color: colors.heroInkText },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" },
  notice: {
    ...typography.caption,
    color: colors.statusPending.text,
    backgroundColor: colors.warningLight,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  columns: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  columnLabel: { ...typography.eyebrow, color: colors.textSecondary },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.xl,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  nameCell: { flex: 1, paddingRight: spacing.sm },
  name: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  nameMuted: { color: colors.textMuted },
  detail: { ...typography.small, color: colors.textSecondary, marginTop: 2 },
  figure: { fontVariant: ["tabular-nums"] },
  qty: { width: QTY_WIDTH, textAlign: "right", ...typography.body, color: colors.textPrimary },
  net: { minWidth: NET_MIN_WIDTH, textAlign: "right", ...typography.body, fontWeight: "600", color: colors.textPrimary },
  ghostRow: { height: 44, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.separator },
  totals: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 56,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.separator,
  },
  totalLabel: { ...typography.heading, color: colors.textPrimary },
  totalFigure: { ...typography.heading, color: colors.textPrimary },
});
