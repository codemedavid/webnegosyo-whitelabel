import React from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { categoryLook, shortCategoryName } from "../../../lib/expenses/category-look";
import { formatCents, weekdayDate } from "../../../lib/expenses/expense-format";
import type { Expense, ExpenseCategory } from "../../../lib/expenses/types";
import { colors, radius, spacing, typography } from "../../../theme/colors";
import { Button } from "../../Button";
import { Icon, type IconName } from "../../Icon";
import { CategoryTile } from "../CategoryTile";

interface ActionRowProps {
  icon: IconName;
  label: string;
  hint?: string;
  onPress: () => void;
  isDisabled?: boolean;
  tone?: "default" | "danger";
  testID?: string;
}

/** One "do this" row under the main button: icon well, words, chevron. */
export function ActionRow({ icon, label, hint, onPress, isDisabled = false, tone = "default", testID }: ActionRowProps) {
  const color = tone === "danger" ? colors.danger : colors.textPrimary;
  return (
    <TouchableOpacity
      style={[styles.action, isDisabled && styles.disabled]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
      accessibilityState={{ disabled: isDisabled }}
      testID={testID}
    >
      <View style={styles.well}>
        <Icon name={icon} size={17} color={color} />
      </View>
      <View style={styles.actionCopy}>
        <Text style={[styles.actionLabel, { color }]}>{label}</Text>
        {hint ? <Text style={styles.actionHint}>{hint}</Text> : null}
      </View>
      <Icon name="chevron" size={16} color={colors.textTertiary} />
    </TouchableOpacity>
  );
}

export function ActionList({ children }: { children: React.ReactNode }) {
  return <View style={styles.list}>{children}</View>;
}

interface BillHeroProps {
  category: ExpenseCategory | null;
  amount: string;
  usualLine: string;
  note: string | null;
}

/** The bill at a glance: its tile, the amount due ("about ₱6,200"), what it usually is. */
export function BillHero({ category, amount, usualLine, note }: BillHeroProps) {
  return (
    <View style={styles.hero}>
      <CategoryTile look={categoryLook(category)} size={44} />
      <View style={styles.heroCopy}>
        <Text style={styles.heroAmount} numberOfLines={1}>
          {amount}
        </Text>
        <Text style={styles.heroUsual} numberOfLines={2}>
          {usualLine}
        </Text>
        {note ? <Text style={styles.heroNote}>{note}</Text> : null}
      </View>
    </View>
  );
}

interface LinkListProps {
  expenses: readonly Expense[];
  categories: ReadonlyMap<string, ExpenseCategory>;
  isLoading: boolean;
  error: string | null;
  emptyText: string;
  isBusy: boolean;
  onPick: (expense: Expense) => void;
  onRetry: () => void;
}

/** "I already recorded it": the expenses that could be this payment, picked in place. */
export function LinkList({ expenses, categories, isLoading, error, emptyText, isBusy, onPick, onRetry }: LinkListProps) {
  if (isLoading) {
    return (
      <View style={styles.center} accessibilityLabel="Looking for expenses" accessibilityRole="progressbar">
        <ActivityIndicator color={colors.textMuted} />
      </View>
    );
  }
  if (error && expenses.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>Your expenses could not be read. {error}</Text>
        <Button label="Try again" tone="secondary" size="sm" fullWidth={false} onPress={onRetry} />
      </View>
    );
  }
  if (expenses.length === 0) {
    return <Text style={styles.empty}>{emptyText}</Text>;
  }
  return (
    <View style={styles.list}>
      {expenses.map((expense, index) => {
        const category = categories.get(expense.categoryId) ?? null;
        const title = expense.note || (category ? shortCategoryName(category.name) : "Expense");
        const amount = formatCents(expense.amountCents, { compact: true });
        const when = weekdayDate(expense.spentOn);
        return (
          <TouchableOpacity
            key={expense.id}
            style={[styles.linkRow, index > 0 && styles.divided, isBusy && styles.disabled]}
            onPress={() => onPick(expense)}
            disabled={isBusy}
            accessibilityRole="button"
            accessibilityLabel={`This one: ${title}, ${amount}, ${when}`}
            testID={`bill-link-${expense.id}`}
          >
            <CategoryTile look={categoryLook(category)} size={30} />
            <View style={styles.actionCopy}>
              <Text style={styles.linkTitle} numberOfLines={1}>
                {title}
              </Text>
              <Text style={styles.actionHint}>{expense.paidToName ? `${when} · ${expense.paidToName}` : when}</Text>
            </View>
            <Text style={styles.linkAmount}>{amount}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { backgroundColor: colors.surfaceSubtle, borderRadius: radius.lg, overflow: "hidden" },
  action: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.md, minHeight: 56 },
  disabled: { opacity: 0.5 },
  well: { width: 34, height: 34, borderRadius: radius.full, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
  actionCopy: { flex: 1, gap: 1, paddingVertical: spacing.sm },
  actionLabel: { ...typography.body, fontWeight: "600" },
  actionHint: { ...typography.caption, color: colors.textMuted },
  hero: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.xs },
  heroCopy: { flex: 1, gap: 2 },
  heroAmount: { fontSize: 28, fontWeight: "800", color: colors.textPrimary, fontVariant: ["tabular-nums"], letterSpacing: -0.5 },
  heroUsual: { ...typography.caption, color: colors.textMuted },
  heroNote: { ...typography.caption, fontWeight: "600", color: colors.statusPending.text },
  center: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.lg },
  empty: { ...typography.body, color: colors.textMuted, paddingVertical: spacing.sm },
  linkRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.md, minHeight: 56 },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
  linkTitle: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  linkAmount: { ...typography.body, fontWeight: "700", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
});
