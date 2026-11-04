import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { ShiftSalesReport } from "../../lib/cash/shift-sales";
import type { DrawerLens } from "../../lib/cash/shift-sales-view";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { ReceiptList } from "./ReceiptList";
import { ShiftSalesHero } from "./ShiftSalesHero";
import { BreakdownCard, DrawerLensCard, ItemsSoldCard, PaidByCard, TopItemsCard } from "./ShiftSalesSections";
import { SlipPreview } from "./SlipPreview";
import { ink } from "./shift-sales-styles";

export type ShiftSalesLens = "store" | "drawer";

export interface ShiftSalesBodyProps {
  report: ShiftSalesReport;
  title: string;
  isOpen: boolean;
  isWide: boolean;
  lens: ShiftSalesLens;
  drawer: { lens: DrawerLens | null; pendingText: string | null };
  notice: string | null;
  onOpenReceipt?: (orderId: string) => void;
  onPrint?: () => void;
  onShare?: () => void;
  isPrinting?: boolean;
  onEndShift?: () => void;
  printLabel?: string;
  printStatus?: string | null;
  /** The paper as it prints (her own report): shown under the figures. */
  paper?: string | null;
}

/**
 * The report, laid out once for both sizes. Phone: one column — hero, Paid
 * by, order types, receipts, then the folded top items. Tablet (≥ 900pt):
 * the figures on the left, the searchable receipt list on the right, so a
 * cashier can check the paper stack against the list without scrolling the
 * totals away.
 */
export function ShiftSalesBody(props: ShiftSalesBodyProps) {
  const { report, isWide, lens } = props;
  const hero =
    lens === "drawer" ? (
      <DrawerLensCard lens={props.drawer.lens} pendingText={props.drawer.pendingText} />
    ) : (
      <ShiftSalesHero
        report={report}
        title={props.title}
        isOpen={props.isOpen}
        onPrint={props.onPrint}
        onShare={props.onShare}
        isPrinting={props.isPrinting}
        onEndShift={props.onEndShift}
        printLabel={props.printLabel}
        printStatus={props.printStatus}
      />
    );
  const notice = props.notice ? (
    <View style={styles.notice} accessibilityRole="alert">
      <Text style={styles.noticeText}>{props.notice}</Text>
    </View>
  ) : null;
  const figures = (
    <>
      {report.payments ? <PaidByCard payments={report.payments} /> : null}
      {report.orderTypes ? <BreakdownCard title="Order types" rows={report.orderTypes} /> : null}
      {report.channels && report.channels.length > 1 ? <BreakdownCard title="Where orders came from" rows={report.channels} /> : null}
    </>
  );
  const receipts = (
    <ReceiptList receipts={report.receipts} hidden={report.hidden} isTruncated={report.receiptsTruncated} onOpen={props.onOpenReceipt} />
  );
  const isCashier = report.scope === "cashier";
  const items = isCashier ? (
    report.hidden ? null : <ItemsSoldCard items={report.items} isTruncated={report.itemsTruncated === true} />
  ) : report.items ? (
    <TopItemsCard items={report.items} />
  ) : null;
  const paper = props.paper ? <SlipPreview text={props.paper} /> : null;

  if (!isWide) {
    return (
      <View style={styles.column}>
        {notice}
        {hero}
        {figures}
        {isCashier ? items : null}
        {receipts}
        {isCashier ? null : items}
        {paper}
      </View>
    );
  }
  return (
    <View style={styles.column}>
      {notice}
      <View style={styles.row}>
        <View style={[styles.column, styles.main]}>
          {hero}
          {figures}
          {items}
        </View>
        <View style={[styles.column, styles.side]}>
          {paper}
          {receipts}
        </View>
      </View>
    </View>
  );
}

/** The hero's shape while the first read is on its way — "Adding up…", never ₱0. */
export function ShiftSalesSkeleton() {
  return (
    <View style={styles.column} accessible accessibilityRole="progressbar" accessibilityLabel="Adding up this shift's sales">
      <View style={ink.hero}>
        <View style={[styles.block, { width: "40%", height: 10 }]} />
        <Text style={ink.pending}>Adding up…</Text>
        <View style={[styles.block, { width: "70%", height: 12 }]} />
        <View style={[styles.block, { width: "55%", height: 12 }]} />
      </View>
      {[0, 1].map((key) => (
        <View key={key} style={styles.ghost} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: spacing.md },
  row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.xl },
  main: { flex: 3 },
  side: { flex: 2 },
  notice: { backgroundColor: colors.warningLight, borderRadius: radius.md, padding: spacing.md },
  noticeText: { ...typography.caption, fontWeight: "600", color: colors.statusPending.text },
  block: { backgroundColor: colors.heroInkElevated, borderRadius: radius.sm },
  ghost: { height: 140, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.separator },
});
