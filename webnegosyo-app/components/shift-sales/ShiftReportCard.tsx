import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { useAuthStore } from "../../stores/auth-store";
import { myShiftSalesHref } from "../../lib/cash-routes";
import { printableReport, printStateText, reportSummaryLine } from "../../lib/cash/shift-report-actions";
import { useServerShiftSales } from "../../lib/cash/shift-sales-hooks";
import type { ShiftSalesTarget } from "../../lib/cash/shift-sales-state";
import { colors, spacing, typography } from "../../theme/colors";
import { Button, type ButtonTone } from "../Button";
import { card } from "./shift-sales-styles";
import { useShiftReportPrint } from "./use-shift-report-print";

interface ShiftReportCardProps {
  shiftId: string;
  /** `primary` at the very end of End shift (the slip screen); `secondary` inside the steps. */
  tone?: Extract<ButtonTone, "primary" | "secondary">;
}

/**
 * "Print my shift report": the cashier's own sales for this shift (items sold,
 * voids, her drawer) on paper, from End shift and the remittance slip. When the
 * server cannot answer here (a store not on the platform, a database not yet
 * updated, no connection) the button opens the Shift sales screen instead,
 * which counts her sales on the tablet and prints from there.
 */
export function ShiftReportCard({ shiftId, tone = "secondary" }: ShiftReportCardProps) {
  const isDemo = useAuthStore((s) => s.isDemo);
  const orderBackend = useAuthStore((s) => s.orderBackend);
  const target = useMemo<ShiftSalesTarget>(() => ({ kind: "shift", shiftId, scope: "cashier" }), [shiftId]);
  const server = useServerShiftSales(target, !isDemo && orderBackend === "platform");
  const printer = useShiftReportPrint();
  const report = printableReport(server.read.status === "done" ? server.read.fetch : null);
  const isReading = server.read.status === "loading";
  const status = printStateText(printer.state);
  const open = () => router.push(myShiftSalesHref(shiftId) as never);

  return (
    <View style={card.card} testID="shift-report-card">
      <View style={card.head}>
        <Text style={card.title}>Your shift report</Text>
        <Text style={card.hint}>Your sales only</Text>
      </View>
      <Text style={card.meta}>
        {report ? reportSummaryLine(report) : isReading ? "Getting your shift report…" : "Items sold, voids and your drawer, ready to print."}
      </Text>
      {report ? (
        <Button
          label="Print my shift report"
          icon="printer"
          size="lg"
          tone={tone}
          isLoading={printer.state.status === "printing"}
          onPress={() => void printer.print(report)}
          accessibilityHint="Prints your sales, items sold, voids and drawer for this shift"
          testID="shift-report-print"
        />
      ) : (
        <Button label="Open my shift report" icon="report" size="lg" tone={tone} onPress={open} isLoading={isReading} testID="shift-report-open" />
      )}
      {report ? (
        <View style={styles.row}>
          <Button label="Share" icon="export" tone="secondary" fullWidth={false} style={styles.flex} onPress={() => void printer.share(report)} />
          <Button label="See it" icon="report" tone="secondary" fullWidth={false} style={styles.flex} onPress={open} />
        </View>
      ) : null}
      {report && !printer.hasPrinter && printer.state.status === "idle" ? <Text style={styles.note}>{printer.noPrinterMessage}</Text> : null}
      {status ? (
        <Text
          style={[styles.note, printer.state.status === "failed" ? styles.failed : printer.state.status === "printed" ? styles.done : null]}
          accessibilityLiveRegion="polite"
          accessibilityRole={printer.state.status === "failed" ? "alert" : undefined}
          testID="shift-report-status"
        >
          {status}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.sm },
  flex: { flex: 1 },
  note: { ...typography.caption, color: colors.textMuted },
  failed: { color: colors.danger, fontWeight: "600" },
  done: { color: colors.success, fontWeight: "600" },
});
