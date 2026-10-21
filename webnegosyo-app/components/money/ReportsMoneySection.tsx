import React from "react";
import { StyleSheet, View } from "react-native";

import { monthSpentDetail, profitRowDetail, type MoneyAccess } from "../../lib/expenses/money-glance";
import { useKeptThisMonth, useMonthSpent } from "../../lib/expenses/money-glance-hooks";
import { tabPresentation } from "../../lib/workspace-presentation";
import { colors, radius, shadow } from "../../theme/colors";
import { SectionHeader } from "../SectionHeader";
import { MoneyRow } from "./MoneyRow";

interface ReportsMoneySectionProps {
  access: MoneyAccess;
  onOpen: (tab: "expenses" | "profit") => void;
}

/** Mounted only for an account that may open Expenses: the month read has no switch of its own. */
function ExpensesRow({ isGrouped, onOpen }: { isGrouped: boolean; onOpen: () => void }) {
  const month = useMonthSpent();
  return (
    <MoneyRow
      icon="receipt"
      tone="accent"
      title="Expenses"
      detail={month ? monthSpentDetail(month.cents, month.monthName) : tabPresentation("expenses").hint}
      onPress={onOpen}
      isGrouped={isGrouped}
      testID="reports-money-expenses"
    />
  );
}

function ProfitRow({ canReadFigure, onOpen }: { canReadFigure: boolean; onOpen: () => void }) {
  const report = useKeptThisMonth(canReadFigure);
  return (
    <MoneyRow
      icon="trends"
      tone="accent"
      title="Profit"
      detail={report ? profitRowDetail(report) : tabPresentation("profit").hint}
      onPress={onOpen}
      testID="reports-money-profit"
    />
  );
}

/**
 * Reports' "Money" section (design screen 06): Expenses and Profit with their
 * live figures, above "Dig deeper". The Profit row is only for an account
 * that can open it — a reports-only manager used to meet a locked screen. A
 * figure still loading (or unreadable) falls back to the row's plain hint.
 */
export function ReportsMoneySection({ access, onOpen }: ReportsMoneySectionProps) {
  if (!access.canSeeExpenses && !access.canSeeProfitRow) return null;
  return (
    <>
      <SectionHeader title="Money" hint="What went out, and what you kept" />
      <View style={styles.group}>
        {access.canSeeExpenses ? (
          <ExpensesRow isGrouped={access.canSeeProfitRow} onOpen={() => onOpen("expenses")} />
        ) : null}
        {access.canSeeProfitRow ? <ProfitRow canReadFigure={access.canSeeKept} onOpen={() => onOpen("profit")} /> : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  group: { backgroundColor: colors.card, borderRadius: radius.lg, overflow: "hidden", ...shadow.sm },
});
