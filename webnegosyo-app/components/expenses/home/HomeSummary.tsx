import React from "react";
import { StyleSheet, View } from "react-native";

import type { KeptFigure } from "../../../lib/expenses/expenses-home-data";
import type { HomeModel } from "../../../lib/expenses/expenses-home-model";
import type { NeedsYouItem } from "../../../lib/expenses/expenses-home-needs";
import { spacing } from "../../../theme/colors";
import { SectionHeader } from "../../SectionHeader";
import { SegmentedControl } from "../../SegmentedControl";
import { CategoryBreakdown } from "./CategoryBreakdown";
import { ExpensesHero, type HeroBillsLine, type HeroState } from "./ExpensesHero";
import { NeedsYouCard } from "./NeedsYouCard";

export type HomeMode = "list" | "category";

const MODES: readonly { label: string; value: HomeMode }[] = [
  { label: "List", value: "list" },
  { label: "By category", value: "category" },
];

export interface HomeHeroProps {
  model: HomeModel;
  /** Whether the month on screen has come back; the hero shows no figure until it has. */
  state?: HeroState;
  monthShort: string;
  /** "Clear filters", "Show all of October", or null when there is nothing to clear. */
  clearLabel: string | null;
  onClear: () => void;
  kept: KeptFigure | null;
  onOpenProfit: () => void;
  isTruncated: boolean;
  canGoNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onNeed: (item: NeedsYouItem) => void;
  /** "Not now" on a Needs-you item that offers it ("Make it a bill?"). */
  onDismissNeed?: (item: NeedsYouItem) => void;
  /** The hero's "₱X still to pay · N bills" line. */
  bills?: HeroBillsLine | null;
  /** The Bills to pay card (or the one-line set-up door), drawn right under the hero. */
  billsCard?: React.ReactNode;
}

/** The ink hero and the "Needs you" card: the top of the screen on a phone, the side column on a tablet. */
export function HomeHero(props: HomeHeroProps) {
  const { model } = props;
  return (
    <View style={styles.stack}>
      <ExpensesHero
        eyebrow={model.eyebrow}
        state={props.state}
        monthShort={props.monthShort}
        totals={model.totals}
        change={model.change}
        clearLabel={props.clearLabel}
        onClear={props.onClear}
        today={model.today}
        kept={props.kept}
        onOpenProfit={props.onOpenProfit}
        isTruncated={props.isTruncated}
        canGoNext={props.canGoNext}
        onPrevious={props.onPrevious}
        onNext={props.onNext}
        bills={props.bills}
      />
      {props.billsCard}
      <NeedsYouCard items={model.needs} onAction={props.onNeed} onDismiss={props.onDismissNeed} />
    </View>
  );
}

interface ModeSwitchProps {
  mode: HomeMode;
  onMode: (mode: HomeMode) => void;
}

export function ModeSwitch({ mode, onMode }: ModeSwitchProps) {
  return <SegmentedControl options={MODES} value={mode} onChange={onMode} accessibilityPrefix="Show" />;
}

interface SideBreakdownProps {
  model: HomeModel;
  onPick: (categoryId: string) => void;
}

/** The tablet's side column keeps the by-category view in sight under the hero. */
export function SideBreakdown({ model, onPick }: SideBreakdownProps) {
  return (
    <View>
      <SectionHeader title="By category" hint="Tap one to show only those" />
      <CategoryBreakdown lines={model.breakdown} onPick={onPick} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
});
