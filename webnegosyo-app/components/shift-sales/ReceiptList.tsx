import React, { useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import {
  RECEIPT_PILLS,
  RECEIPTS_TRUNCATED_NOTE,
  receiptAmount,
  receiptMeta,
  searchReceipts,
  type ReceiptPill,
} from "../../lib/cash/shift-sales-view";
import type { ShiftSalesReceipt } from "../../lib/cash/shift-sales";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Icon } from "../Icon";
import { card } from "./shift-sales-styles";

interface ReceiptListProps {
  receipts: readonly ShiftSalesReceipt[];
  hidden: boolean;
  isTruncated: boolean;
  /** Absent (demo, sample receipts) = rows are not tappable. */
  onOpen?: (orderId: string) => void;
}

const PILL_COLORS: Record<ReceiptPill["tone"], { bg: string; fg: string }> = {
  success: { bg: colors.successLight, fg: colors.success },
  warning: { bg: colors.warningLight, fg: colors.statusPending.text },
  danger: { bg: colors.dangerLight, fg: colors.danger },
  neutral: { bg: colors.surfaceSubtle, fg: colors.textMuted },
};

/**
 * Every receipt in the shift, newest first — the stack a cashier hand-counts,
 * searchable by its number or its amount. Tapping one opens the order (view,
 * reprint). The status is a word with an icon, never a colour alone.
 */
export function ReceiptList({ receipts, hidden, isTruncated, onOpen }: ReceiptListProps) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => searchReceipts(receipts, query), [receipts, query]);
  return (
    <View style={card.card} testID="shift-sales-receipts">
      <View style={card.head}>
        <Text style={card.title}>Receipts</Text>
        <Text style={card.hint}>{`${receipts.length}${isTruncated ? "+" : ""}`}</Text>
      </View>
      <View style={styles.search}>
        <Icon name="search" size={16} color={colors.textMuted} />
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder={hidden ? "Find a receipt number" : "Find a number or amount"}
          placeholderTextColor={colors.textTertiary}
          keyboardType="numbers-and-punctuation"
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Search receipts"
          testID="shift-sales-search"
        />
        {query ? (
          <TouchableOpacity onPress={() => setQuery("")} hitSlop={12} accessibilityRole="button" accessibilityLabel="Clear search">
            <Text style={styles.clear}>Clear</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {shown.length === 0 ? (
        <Text style={styles.empty}>{receipts.length === 0 ? "No receipts in this shift yet." : "No receipt matches that."}</Text>
      ) : (
        shown.map((receipt, index) => (
          <ReceiptRow key={receipt.orderId} receipt={receipt} hidden={hidden} isLast={index === shown.length - 1} onOpen={onOpen} />
        ))
      )}
      {isTruncated ? <Text style={card.meta}>{RECEIPTS_TRUNCATED_NOTE}</Text> : null}
    </View>
  );
}

interface ReceiptRowProps {
  receipt: ShiftSalesReceipt;
  hidden: boolean;
  isLast: boolean;
  onOpen?: (orderId: string) => void;
}

function ReceiptRow({ receipt, hidden, isLast, onOpen }: ReceiptRowProps) {
  const pill = RECEIPT_PILLS[receipt.status];
  const tone = PILL_COLORS[pill.tone];
  const amount = receiptAmount(receipt, hidden);
  const meta = receiptMeta(receipt);
  const content = (
    <>
      <View style={styles.copy}>
        <Text style={styles.number}>{receipt.number}</Text>
        <Text style={card.meta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <View style={[styles.pill, { backgroundColor: tone.bg }]}>
        <Icon name={pill.icon} size={12} color={tone.fg} />
        <Text style={[styles.pillText, { color: tone.fg }]}>{pill.label}</Text>
      </View>
      <Text style={[card.money, receipt.status === "void" && styles.struck]}>{amount}</Text>
    </>
  );
  const rowStyle = [styles.row, !isLast && styles.divided];
  const label = `Receipt ${receipt.number}, ${meta}, ${pill.label}, ${amount}`;
  if (!onOpen) {
    return (
      <View style={rowStyle} accessible accessibilityLabel={label}>
        {content}
      </View>
    );
  }
  return (
    <TouchableOpacity style={rowStyle} onPress={() => onOpen(receipt.orderId)} accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Opens the order to view or reprint it">
      {content}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  input: { flex: 1, ...typography.body, color: colors.textPrimary, paddingVertical: spacing.sm },
  clear: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
  empty: { ...typography.body, color: colors.textMuted, paddingVertical: spacing.md, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 56, paddingVertical: spacing.sm },
  divided: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
  copy: { flex: 1, gap: 2 },
  number: { ...typography.body, fontWeight: "800", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  pillText: { ...typography.small, fontWeight: "800" },
  struck: { textDecorationLine: "line-through", color: colors.textMuted },
});
