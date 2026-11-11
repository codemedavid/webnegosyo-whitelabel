import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { categoryLook } from "../../lib/expenses/category-look";
import type { RefusedPayout } from "../../lib/expenses/expense-queue";
import { formatCents } from "../../lib/expenses/expense-format";
import type { CloseLine, CloseReview, CountVerdict } from "../../lib/expenses/money-glance-close";
import type { ExpenseCategory } from "../../lib/expenses/types";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { CategoryTile } from "../expenses/CategoryTile";
import { DrawerSheet, sheetText } from "./DrawerSheet";
import { RefusedPayouts } from "./RefusedPayouts";

interface CloseShiftSheetProps {
  review: CloseReview;
  /** "The drawer changed while you were counting…" — shown above End shift. */
  notice?: string | null;
  categories: ReadonlyMap<string, ExpenseCategory>;
  isBusy: boolean;
  onEnd: () => void;
  onClose: () => void;
  /** Absent for staff who cannot open Expenses. */
  onOpenExpenses?: () => void;
  /**
   * Pay-outs from this drawer the store did not take: they explain a short
   * count, and the cashier can try again or remove them right here.
   */
  refusedPayouts?: readonly RefusedPayout[];
  onRetryRefused?: (id: string) => Promise<void>;
  onRemoveRefused?: (id: string) => Promise<void>;
}

const VERDICT_TONE: Record<CountVerdict["kind"], { bg: string; fg: string }> = {
  short: { bg: colors.dangerLight, fg: colors.danger },
  over: { bg: colors.warningLight, fg: colors.statusPending.text },
  exact: { bg: colors.successLight, fg: colors.success },
};

const SIGN: Record<CloseLine["sign"], string> = { "": "", "+": "+", "-": "−" };
const money = (cents: number): string => formatCents(cents, { compact: true });

/**
 * Closing the drawer (design screen 07): what it should hold, built line by
 * line so the cashier sees why; every expense paid from it, by name; the
 * count and the difference, stated plainly and without blame. "End shift"
 * saves exactly what is on the sheet.
 */
export function CloseShiftSheet({
  review,
  notice = null,
  categories,
  isBusy,
  onEnd,
  onClose,
  onOpenExpenses,
  refusedPayouts,
  onRetryRefused,
  onRemoveRefused,
}: CloseShiftSheetProps) {
  const tone = VERDICT_TONE[review.verdict.kind];
  return (
    <DrawerSheet visible title={review.title} subtitle={review.subtitle} onClose={onClose} isBusy={isBusy}>
      <Text style={styles.eyebrow}>What the drawer should hold</Text>
      <View style={styles.lines}>
        {review.lines.map((line) => (
          <View key={line.key} style={styles.line}>
            <Text style={styles.lineLabel}>{line.label}</Text>
            <Text style={styles.lineValue}>
              {SIGN[line.sign]}
              {money(line.cents)}
            </Text>
          </View>
        ))}
        <View style={[styles.line, styles.total]}>
          <Text style={styles.totalLabel}>Should be in the drawer</Text>
          <Text style={styles.totalValue}>{money(review.totalCents)}</Text>
        </View>
      </View>

      {review.items.length > 0 ? (
        <View style={styles.items}>
          {review.items.map((item) => (
            <View key={item.key} style={styles.item} accessible accessibilityLabel={`${item.title}, ${money(item.cents)}, ${item.detail}`}>
              <CategoryTile look={categoryLook(categories.get(item.categoryId))} size={30} />
              <View style={styles.itemCopy}>
                <Text style={styles.itemTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.itemDetail} numberOfLines={1}>
                  {item.detail}
                </Text>
              </View>
              <Text style={styles.itemAmount}>{money(item.cents)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.counted}>
        <Text style={sheetText.hint}>You counted</Text>
        <Text style={styles.countedValue}>{money(review.countedCents)}</Text>
      </View>

      <View style={[styles.callout, { backgroundColor: tone.bg }]} accessibilityLiveRegion="polite">
        <View style={styles.calloutWell}>
          <Icon name="drawer" size={18} color={tone.fg} />
        </View>
        <View style={styles.calloutCopy}>
          <Text style={[styles.calloutTitle, { color: tone.fg }]}>{review.verdict.text}</Text>
          <Text style={styles.calloutBody}>{review.verdictNote}</Text>
          <Text style={styles.calloutBody}>{review.handOver}</Text>
        </View>
      </View>

      {refusedPayouts && onRetryRefused && onRemoveRefused ? (
        <RefusedPayouts payouts={refusedPayouts} onRetry={onRetryRefused} onRemove={onRemoveRefused} isExplained />
      ) : null}

      {notice ? (
        <Text style={styles.notice} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          {notice}
        </Text>
      ) : null}

      <Button
        label={isBusy ? "Ending…" : "End shift"}
        onPress={onEnd}
        isLoading={isBusy}
        disabled={isBusy}
        size="lg"
        fullWidth
        accessibilityLabel="End shift and save the count"
        style={styles.end}
      />
      {onOpenExpenses ? (
        <Button label="See in Expenses" tone="ghost" icon="receipt" onPress={onOpenExpenses} disabled={isBusy} fullWidth />
      ) : null}
    </DrawerSheet>
  );
}

const styles = StyleSheet.create({
  eyebrow: { ...typography.eyebrow, color: colors.textTertiary, marginTop: spacing.sm },
  lines: { gap: spacing.xs },
  line: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", minHeight: 24 },
  lineLabel: { ...typography.body, color: colors.textSecondary },
  lineValue: { ...typography.body, fontWeight: "700", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  total: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator, paddingTop: spacing.sm, marginTop: spacing.xs },
  totalLabel: { ...typography.body, fontWeight: "800", color: colors.textPrimary },
  totalValue: { ...typography.heading, fontWeight: "800", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  items: { backgroundColor: colors.surfaceSubtle, borderRadius: radius.lg, padding: spacing.md, gap: spacing.md },
  item: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  itemCopy: { flex: 1, gap: 2 },
  itemTitle: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  itemDetail: { ...typography.caption, color: colors.textSecondary },
  itemAmount: { ...typography.body, fontWeight: "700", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  counted: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.sm },
  countedValue: { fontSize: 24, fontWeight: "800", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  callout: { flexDirection: "row", gap: spacing.md, borderRadius: radius.md, padding: spacing.md },
  calloutWell: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  calloutCopy: { flex: 1, gap: 2 },
  calloutTitle: { ...typography.heading },
  calloutBody: { ...typography.caption, color: colors.textPrimary },
  end: { marginTop: spacing.md },
  notice: {
    ...typography.body,
    fontWeight: "700",
    color: colors.statusPending.text,
    backgroundColor: colors.warningLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
});
