import React from "react";
import { View, Text, StyleSheet } from "react-native";

import { colors, typography, spacing } from "../../theme/colors";
import {
  bringBackActions,
  describeKnownBuyers,
  leverTiles,
  type BringBackAction,
  type CustomerDashboard,
  type DashboardWindow,
  type RewardsSnapshot,
} from "../../lib/customer-hub/dashboard";
import { SectionHeader } from "../SectionHeader";
import { RevenueSplitCard } from "./RevenueSplitCard";
import { LeverTiles } from "./LeverTiles";
import { KnownBuyersCard } from "./KnownBuyersCard";
import { BringBackCard } from "./BringBackCard";
import { FavouritesCard } from "./FavouritesCard";
import { BestCustomersCard } from "./BestCustomersCard";
import { ReportsColumns } from "./ReportsColumns";

interface CustomerInsightsProps {
  isWide: boolean;
  /** Rendered last in the side column ("Dig deeper"). */
  aside?: React.ReactNode;
  dashboard: CustomerDashboard;
  window: DashboardWindow;
  periodLabel: string;
  nowMs: number;
  /** Reader caveat (a truncated history), printed at the foot when present. */
  coverageNote: string | null;
  canText: boolean;
  /** Null when this account cannot see reward cards, or they could not be read. */
  rewards: RewardsSnapshot | null;
  onAction: (action: BringBackAction) => void;
  onStartRewards?: () => void;
  onOpenCustomer: (customerId: string) => void;
  onSeeAllGuests?: () => void;
}

/**
 * The customer-first dashboard, in the order a store owner asks: how much came
 * in and from whom, which dial moved, and what to do about it today (the main
 * column); then how many buyers they can even name, what guests love, and who
 * they are (the side column, stacked underneath on a phone).
 */
export function CustomerInsights({
  isWide,
  aside,
  dashboard,
  window,
  periodLabel,
  nowMs,
  coverageNote,
  canText,
  rewards,
  onAction,
  onStartRewards,
  onOpenCustomer,
  onSeeAllGuests,
}: CustomerInsightsProps) {
  const known = describeKnownBuyers(window, dashboard);
  // "Start a reward card" is the fix for knowing too few buyers, so when that
  // card is asking for it the list below does not ask a second time.
  const isRewardsPitchOnKnownCard =
    known !== null && known.tone !== "good" && rewards !== null && !rewards.hasActiveProgram && !!onStartRewards;
  const actions = bringBackActions({
    dashboard,
    window,
    canText,
    rewards: isRewardsPitchOnKnownCard ? null : rewards,
  });

  const main = (
    <>
      <RevenueSplitCard window={window} tillComplete={dashboard.tillComplete} periodLabel={periodLabel} />
      <View style={styles.gap} />
      <LeverTiles tiles={leverTiles(window)} />
      <SectionHeader title="Bring them back" hint="Who to reach today, and the button that does it" />
      <BringBackCard actions={actions} onAction={onAction} />
    </>
  );

  const side = (
    <>
      {known ? (
        <View style={isWide ? undefined : styles.knownStacked}>
          <KnownBuyersCard
            known={known}
            actionLabel={isRewardsPitchOnKnownCard ? "Start a reward card" : undefined}
            onAction={isRewardsPitchOnKnownCard ? onStartRewards : undefined}
          />
        </View>
      ) : null}

      <SectionHeader title="What they love" hint={`Most ordered, ${periodLabel.toLowerCase()}`} />
      <FavouritesCard window={window} />

      <SectionHeader title="Best customers" hint="Who spent the most" />
      <BestCustomersCard
        customers={window.topCustomers}
        nowMs={nowMs}
        onOpenCustomer={onOpenCustomer}
        onSeeAll={onSeeAllGuests}
      />

      {coverageNote ? <Text style={styles.coverage}>{coverageNote}</Text> : null}
      {aside}
    </>
  );

  return <ReportsColumns isWide={isWide} main={main} side={side} />;
}

const styles = StyleSheet.create({
  gap: { height: spacing.md },
  knownStacked: { marginTop: spacing.xl },
  coverage: { ...typography.small, color: colors.textTertiary, marginTop: spacing.md },
});
