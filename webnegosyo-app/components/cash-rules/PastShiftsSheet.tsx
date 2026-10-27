import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { previousBusinessDayKey, nextBusinessDayKey } from "../../lib/daily-report/business-day";
import type { CutoffSchedule } from "../../lib/business-day/trading-day";
import { pastShiftTarget, type PeriodSalesTarget } from "../../lib/cash-routes";
import { formatDayKey } from "../../lib/cash/rules-form";
import { describePeriodTimes, type ServicePeriod } from "../../lib/cash/service-periods";
import type { ReportSelection } from "../../lib/report-window";
import { colors, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { DrawerSheet, sheetText } from "../drawer/DrawerSheet";
import { ReportRangePicker } from "../ReportRangePicker";
import { RuleChip, RuleChipRow } from "./RuleChip";
import { Stepper } from "./Stepper";

interface PastShiftsSheetProps {
  visible: boolean;
  todayKey: string;
  schedule: CutoffSchedule;
  /** The store's named shifts; empty = whole days only. */
  periods: readonly ServicePeriod[];
  onOpen: (target: PeriodSalesTarget) => void;
  onClose: () => void;
}

/**
 * Reports → Shifts: pick a business day (stepper, or the Reports date picker)
 * and optionally one named shift of it, then open its sales. The window comes
 * from the business-day engine, so a night shift runs into the next calendar
 * day and a day ends at the store's cutoff, not at midnight.
 */
export function PastShiftsSheet({ visible, todayKey, schedule, periods, onOpen, onClose }: PastShiftsSheetProps) {
  const [dayKey, setDayKey] = useState(todayKey);
  const [periodId, setPeriodId] = useState<string | null>(null);
  const [isPicking, setPicking] = useState(false);
  const period = periods.find((p) => p.id === periodId) ?? null;

  const applyPicked = (selection: ReportSelection) => {
    setPicking(false);
    const picked = selection.kind === "day" ? selection.dayKey : selection.kind === "range" ? selection.fromKey : null;
    if (picked) setDayKey(picked > todayKey ? todayKey : picked);
  };

  return (
    <>
      <DrawerSheet visible={visible && !isPicking} title="Shift sales" subtitle="Sales by business day or by shift" onClose={onClose}>
        <Stepper
          label="Business day"
          value={dayKey === todayKey ? "Today" : formatDayKey(dayKey)}
          onDecrease={() => setDayKey((key) => previousBusinessDayKey(key))}
          onIncrease={() => setDayKey((key) => (key >= todayKey ? key : nextBusinessDayKey(key)))}
          decreaseLabel="One day earlier"
          increaseLabel="One day later"
        />
        <Button label="Pick a date" tone="ghost" icon="calendar" onPress={() => setPicking(true)} />

        {periods.length > 0 ? (
          <View style={styles.periods}>
            <Text style={sheetText.label}>Shift</Text>
            <RuleChipRow>
              <RuleChip label="Whole day" isSelected={periodId === null} onPress={() => setPeriodId(null)} />
              {periods.map((p) => (
                <RuleChip
                  key={p.id}
                  label={p.name}
                  accessibilityLabel={`${p.name}, ${describePeriodTimes(p.startsMinutes, p.endsMinutes)}`}
                  isSelected={periodId === p.id}
                  onPress={() => setPeriodId(p.id)}
                />
              ))}
            </RuleChipRow>
            {period ? <Text style={styles.hint}>{describePeriodTimes(period.startsMinutes, period.endsMinutes)}</Text> : null}
          </View>
        ) : (
          <Text style={styles.hint}>Add named shifts in Manage → Cash drawers → Shift & remit rules to split a day.</Text>
        )}

        <Button
          label="Show sales"
          size="lg"
          fullWidth
          style={styles.open}
          onPress={() => onOpen(pastShiftTarget(dayKey, period, schedule))}
        />
      </DrawerSheet>
      <ReportRangePicker
        visible={visible && isPicking}
        selection={{ kind: "day", dayKey }}
        nowMs={Date.now()}
        onApply={applyPicked}
        onClose={() => setPicking(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  periods: { gap: spacing.sm, marginTop: spacing.sm },
  hint: { ...typography.caption, color: colors.textMuted },
  open: { marginTop: spacing.md },
});
