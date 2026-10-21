import React from "react";
import { StyleSheet, View } from "react-native";

import type { FindingCard } from "../../lib/profit/profit-findings";
import type { ProfitWindow } from "../../lib/profit/profit-period";
import type { ReadyProfit } from "../../lib/profit/profit-screen-state";
import type { ProfitGrain } from "../../lib/profit/profit-types";
import { spacing } from "../../theme/colors";
import { ReportsColumns } from "../reports/ReportsColumns";
import { CostTiles } from "./CostTiles";
import { FindingsCard } from "./FindingsCard";
import { FoodStaffBar } from "./FoodStaffBar";
import { MoneyWentCard } from "./MoneyWentCard";
import { ProfitHero } from "./ProfitHero";
import { FirstRunCard } from "./ProfitStates";
import { ProfitTrendCard } from "./ProfitTrendCard";

interface ProfitBodyProps {
  data: ReadyProfit;
  period: ProfitWindow;
  grain: ProfitGrain;
  findings: readonly FindingCard[];
  isWide: boolean;
  onAddExpense: () => void;
  onFinding: (card: FindingCard) => void;
  onOpenCategory: (categoryId: string) => void;
  onOpenAllExpenses: () => void;
}

/**
 * The Profit view: the answer, its three guides, then what changes it. On a
 * phone in reading order; on a tablet the answer and its shape on the left,
 * where the money went and what to check on the right.
 */
export function ProfitBody({
  data,
  period,
  grain,
  findings,
  isWide,
  onAddExpense,
  onFinding,
  onOpenCategory,
  onOpenAllExpenses,
}: ProfitBodyProps) {
  const { report } = data;
  const firstRun = data.isFirstRun ? <FirstRunCard onAdd={onAddExpense} /> : null;
  const hero = <ProfitHero report={report} period={period} />;
  const tiles = <CostTiles report={report} />;
  const foodStaff = <FoodStaffBar report={report} />;
  const went = <MoneyWentCard report={report} onOpenCategory={onOpenCategory} onOpenAll={onOpenAllExpenses} />;
  const trend = data.trend ? <ProfitTrendCard bars={data.trend} grain={grain} /> : null;
  const checks = <FindingsCard cards={findings} onAction={onFinding} />;

  if (isWide) {
    return (
      <ReportsColumns
        isWide
        main={
          <View style={styles.stack}>
            {firstRun}
            {hero}
            {tiles}
            {foodStaff}
            {trend}
          </View>
        }
        side={<View style={styles.stack}>{went}{checks}</View>}
      />
    );
  }
  return (
    <View style={styles.stack}>
      {firstRun}
      {hero}
      {tiles}
      {foodStaff}
      {checks}
      {went}
      {trend}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
});
