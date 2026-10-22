import React from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { billHref } from "../../lib/expenses/bill-links";
import { keptRow, spentTodayRow, unsortedRow, type MoneyAccess } from "../../lib/expenses/money-glance";
import { useKeptThisMonth, useKeptThisMonthBranch, useSpentToday } from "../../lib/expenses/money-glance-hooks";
import { useBillGlance, useBillsStillToPay } from "../../lib/expenses/use-bill-glance";
import { useUnsortedPayouts } from "../../lib/expenses/use-expenses";
import { billForecastLine } from "../../lib/profit/profit-bills";
import { colors, radius, shadow } from "../../theme/colors";
import { MoneyRow, type MoneyRowTone } from "./MoneyRow";
import type { IconName } from "../Icon";

const EXPENSES = "/(main)/expenses";
const PROFIT = "/(main)/profit";

interface Row {
  key: string;
  icon: IconName;
  tone: MoneyRowTone;
  title: string;
  detail: string;
  href: string;
  actionLabel?: string;
}

/**
 * Home's money-out card, under the sales hero (design screen 06): a bill that
 * is late or due within 3 days ("Rent is 2 days late" · Pay), what was spent
 * today, what the store kept this month (and what is left once this month's
 * bills are paid), and pay-outs waiting for a category. Each row is shown
 * only to an account that may open where it leads, and hides quietly while
 * its figure is loading or could not be read — it never holds up Home.
 */
export function HomeMoneyCard({ access }: { access: MoneyAccess }) {
  const spent = useSpentToday(access.canSeeExpenses);
  const kept = useKeptThisMonth(access.canSeeKept);
  const keptBranch = useKeptThisMonthBranch();
  const { payouts } = useUnsortedPayouts(access.canSeeExpenses);
  // Bills are the expense book's: the same key opens them (cashiers never see one).
  const bill = useBillGlance(access.canSeeExpenses);
  const still = useBillsStillToPay(access.canSeeKept, keptBranch);

  const keptText = kept ? keptRow(kept) : null;
  const forecast = kept ? billForecastLine({ profitCents: kept.profitCents, isCurrentPartialMonth: kept.isPartial, still }) : null;
  const unsorted = access.canSeeExpenses ? unsortedRow(payouts.length) : null;
  const rows: Row[] = [
    ...(bill
      ? [{ key: "bill", icon: "calendar" as const, tone: bill.isLate ? ("accent" as const) : ("ink" as const), title: bill.title, detail: bill.detail, href: billHref(bill.billId), actionLabel: "Pay" }]
      : []),
    ...(spent ? [{ key: "spent", icon: "basket" as const, tone: "ink" as const, ...spentTodayRow(spent), href: EXPENSES }] : []),
    ...(keptText
      ? [{ key: "kept", icon: "trends" as const, tone: keptText.isLoss ? ("danger" as const) : ("good" as const), title: keptText.title, detail: forecast ?? keptText.detail, href: PROFIT }]
      : []),
    ...(unsorted ? [{ key: "unsorted", icon: "receipt" as const, tone: "accent" as const, ...unsorted, href: `${EXPENSES}?view=unsorted` }] : []),
  ];
  if (rows.length === 0) return null;

  return (
    <View style={styles.card}>
      {rows.map((row, index) => (
        <MoneyRow
          key={row.key}
          icon={row.icon}
          tone={row.tone}
          title={row.title}
          detail={row.detail}
          onPress={() => router.push(row.href as never)}
          isGrouped={index < rows.length - 1}
          actionLabel={row.actionLabel}
          testID={`home-money-${row.key}`}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, overflow: "hidden", ...shadow.sm },
});
