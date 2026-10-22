import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { formatCents } from "../../../lib/expenses/expense-format";
import type { HomeTotals } from "../../../lib/expenses/expenses-home-rows";
import type { KeptFigure } from "../../../lib/expenses/expenses-home-data";
import type { HomeChange } from "../../../lib/expenses/expenses-home-model";
import { colors, radius, shadow, spacing, typography } from "../../../theme/colors";
import { Icon, type IconName } from "../../Icon";
import { BigAmount } from "../BigAmount";
import { HeroSplit } from "./HeroSplit";

/** `loading`/`failed`: the month has not come back, so no figure is shown (never a false ₱0). */
export type HeroState = "ready" | "loading" | "failed";

const PENDING_TEXT: Readonly<Record<Exclude<HeroState, "ready">, string>> = {
  loading: "Loading…",
  failed: "Not loaded",
};

/** The Kept link and the Clear chip are drawn small on the ink card; this reaches 44pt. */
const SMALL_TARGET_SLOP = { top: 12, bottom: 12, left: 8, right: 8 };

interface ExpensesHeroProps {
  eyebrow: string;
  state?: HeroState;
  /** "Oct": the month the arrows step from. */
  monthShort: string;
  totals: HomeTotals;
  /** "Up 9% vs 1–22 Sep"; null hides the pill. */
  change: HomeChange | null;
  /** "Clear filters" / "Show all of October"; null hides the chip. */
  clearLabel: string | null;
  onClear: () => void;
  today: { cents: number; count: number } | null;
  kept: KeptFigure | null;
  onOpenProfit: () => void;
  isTruncated: boolean;
  canGoNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}

interface StepProps {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

/** A month arrow drawn for the ink card; 44pt to the thumb via hitSlop. */
function MonthStep({ icon, label, onPress, disabled = false }: StepProps) {
  return (
    <TouchableOpacity
      style={[styles.step, disabled && styles.stepOff]}
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
    >
      <Icon name={icon} size={16} color={colors.heroInkText} />
    </TouchableOpacity>
  );
}

const CHANGE_ICONS: Readonly<Record<HomeChange["direction"], IconName | null>> = {
  up: "arrow-up",
  down: "arrow-down",
  same: null,
};

function countWord(count: number): string {
  return `${count} ${count === 1 ? "expense" : "expenses"}`;
}

/**
 * The one ink card on Expenses: how much went out in the window, how that
 * compares, what it went on, and — for owners who can see Profit — how much
 * the store kept. Every figure follows the filters, so it matches the list.
 */
export function ExpensesHero(props: ExpensesHeroProps) {
  const { totals, today, kept, state = "ready" } = props;
  const isReady = state === "ready";
  const changeIcon = props.change ? CHANGE_ICONS[props.change.direction] : null;
  const hasFooter = isReady && (today !== null || kept !== null);
  return (
    <View style={styles.card} accessibilityRole="summary">
      <View style={styles.topRow}>
        <Text style={styles.eyebrow} numberOfLines={1}>
          {props.eyebrow}
        </Text>
        <View style={styles.monthNav}>
          <MonthStep icon="chevron-left" label="Previous month" onPress={props.onPrevious} />
          <Text style={styles.monthText}>{props.monthShort}</Text>
          <MonthStep icon="chevron" label="Next month" onPress={props.onNext} disabled={!props.canGoNext} />
        </View>
      </View>

      <View style={styles.amountRow}>
        {isReady ? (
          <BigAmount cents={totals.spentCents} color={colors.heroInkText} size={40} testID="expenses-hero-total" />
        ) : (
          <Text style={styles.pending} testID="expenses-hero-pending">
            {PENDING_TEXT[state]}
          </Text>
        )}
        {isReady && props.change ? (
          <View style={styles.changePill}>
            {changeIcon ? <Icon name={changeIcon} size={12} color={colors.heroInkText} /> : null}
            <Text style={styles.changeText}>{props.change.text}</Text>
          </View>
        ) : null}
      </View>

      {props.clearLabel ? (
        <TouchableOpacity
          style={styles.clear}
          onPress={props.onClear}
          hitSlop={SMALL_TARGET_SLOP}
          accessibilityRole="button"
          accessibilityLabel={props.clearLabel}
        >
          <Icon name="close" size={12} color={colors.heroInkText} />
          <Text style={styles.clearText}>{props.clearLabel}</Text>
        </TouchableOpacity>
      ) : null}

      {isReady ? <HeroSplit split={totals.split} /> : null}

      {isReady && totals.cashMovedCents > 0 ? (
        <Text style={styles.note}>
          Cash moved, not counted: {formatCents(totals.cashMovedCents, { compact: true })}
        </Text>
      ) : null}
      {isReady && props.isTruncated ? (
        <Text style={styles.note}>Too many rows to show on the phone; this total may be short. Open it on the web.</Text>
      ) : null}

      {hasFooter ? (
        <View style={styles.footer}>
          {today ? (
            <Text style={styles.footerText}>
              Today <Text style={styles.footerStrong}>{formatCents(today.cents, { compact: true })}</Text> · {countWord(today.count)}
            </Text>
          ) : (
            <View />
          )}
          {kept ? (
            <TouchableOpacity
              style={styles.kept}
              onPress={props.onOpenProfit}
              hitSlop={SMALL_TARGET_SLOP}
              accessibilityRole="button"
              accessibilityLabel={`${kept.isPartial ? "Kept so far" : "Kept"} ${formatCents(kept.cents, { compact: true })}. Open Profit`}
            >
              <Text style={styles.footerText}>{kept.isPartial ? "Kept so far " : "Kept "}</Text>
              <Text style={[styles.footerStrong, kept.cents >= 0 ? styles.positive : styles.loss]}>
                {formatCents(kept.cents, { compact: true })}
              </Text>
              <Icon name="chevron" size={14} color={kept.cents >= 0 ? colors.heroInkPositive : colors.dangerLight} />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.heroInk, borderRadius: radius.lg, padding: spacing.xl, ...shadow.md },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  eyebrow: { ...typography.eyebrow, color: colors.heroInkMuted, flexShrink: 1 },
  monthNav: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  monthText: { ...typography.caption, fontWeight: "700", color: colors.heroInkText, minWidth: 30, textAlign: "center" },
  step: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.heroInkElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  stepOff: { opacity: 0.35 },
  amountRow: { flexDirection: "row", alignItems: "flex-end", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  changePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.heroInkElevated,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    marginBottom: 8,
  },
  changeText: { ...typography.small, fontWeight: "700", color: colors.heroInkText },
  pending: { ...typography.title, color: colors.heroInkMuted, paddingVertical: spacing.xs },
  clear: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.heroInkElevated,
  },
  clearText: { ...typography.small, fontWeight: "700", color: colors.heroInkText },
  note: { ...typography.small, color: colors.heroInkMuted, marginTop: spacing.sm },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.heroInkElevated,
  },
  footerText: { ...typography.caption, color: colors.heroInkMuted },
  footerStrong: { ...typography.caption, fontWeight: "800", color: colors.heroInkText, fontVariant: ["tabular-nums"] },
  kept: { flexDirection: "row", alignItems: "center", minHeight: 32 },
  positive: { color: colors.heroInkPositive },
  loss: { color: colors.dangerLight },
});
