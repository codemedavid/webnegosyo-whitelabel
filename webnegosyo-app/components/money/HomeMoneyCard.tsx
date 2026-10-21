import React from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { keptRow, spentTodayRow, unsortedRow, type MoneyAccess } from "../../lib/expenses/money-glance";
import { useKeptThisMonth, useSpentToday } from "../../lib/expenses/money-glance-hooks";
import { useUnsortedPayouts } from "../../lib/expenses/use-expenses";
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
}

/**
 * Home's money-out card, under the sales hero (design screen 06): what was
 * spent today, what the store kept this month, and pay-outs waiting for a
 * category. Each row is shown only to an account that may open where it
 * leads, and hides quietly while its figure is loading or could not be read —
 * it never holds up Home.
 */
export function HomeMoneyCard({ access }: { access: MoneyAccess }) {
  const spent = useSpentToday(access.canSeeExpenses);
  const kept = useKeptThisMonth(access.canSeeKept);
  const { payouts } = useUnsortedPayouts(access.canSeeExpenses);

  const keptText = kept ? keptRow(kept) : null;
  const unsorted = access.canSeeExpenses ? unsortedRow(payouts.length) : null;
  const rows: Row[] = [
    ...(spent ? [{ key: "spent", icon: "basket" as const, tone: "ink" as const, ...spentTodayRow(spent), href: EXPENSES }] : []),
    ...(keptText
      ? [{ key: "kept", icon: "trends" as const, tone: keptText.isLoss ? ("danger" as const) : ("good" as const), title: keptText.title, detail: keptText.detail, href: PROFIT }]
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
          testID={`home-money-${row.key}`}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, overflow: "hidden", ...shadow.sm },
});
