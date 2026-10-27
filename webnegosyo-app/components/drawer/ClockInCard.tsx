import React, { useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { defaultDrawerChoice, describeDrawerPolicy, type DrawerSlot } from "../../lib/cash-drawers";
import { formatPeso } from "../../lib/format";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { CountModeSwitch, type CountMode } from "../cash/CountModeSwitch";
import { DenominationCounter } from "../cash/DenominationCounter";
import { countTotalCents, type DenominationCounts } from "../../lib/cash/denominations";
import { floatNote, type PickablePeriod } from "../../lib/cash/shift-start";
import { parseCashInput } from "../../lib/shift";

/** What a start carries beside the drawer and the float. */
export interface ClockInExtras {
  servicePeriodId: string | null;
  /** The opening count, bill by bill, when counted that way. */
  denominations: DenominationCounts | null;
}

interface ClockInCardProps {
  /** The tills of this branch; empty = this store uses personal drawers. */
  board: readonly DrawerSlot[];
  isBusy: boolean;
  canManage: boolean;
  /** Why tills cannot be offered right now (branch not chosen, read failed). */
  notice: string | null;
  /** A plain pointer, not a problem: "Start a shift to pay from the drawer." */
  hint?: string | null;
  onClockIn: (drawerId: string | null, floatText: string, extras: ClockInExtras) => void;
  onSetUpDrawers: () => void;
  /** Named shifts (service periods) for this branch; empty = none set up (nothing is asked). */
  periods?: readonly PickablePeriod[];
  /** The one running now, preselected. */
  defaultPeriodId?: string | null;
}

/**
 * Starting a shift: pick the till, confirm the starting cash, clock in.
 *
 * Lands on the first free till so the common case is one tap. A zero-balance
 * till shows its float locked at ₱0 instead of an input — the owner decided
 * that, not the cashier. A till someone else holds is shown, not hidden, so
 * "where is Cashier 2?" answers itself ("In use · Ana").
 */
export function ClockInCard({
  board,
  isBusy,
  canManage,
  notice,
  hint = null,
  onClockIn,
  onSetUpDrawers,
  periods = [],
  defaultPeriodId = null,
}: ClockInCardProps) {
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [floatText, setFloatText] = useState<string | null>(null);
  const [mode, setMode] = useState<CountMode>("total");
  const [counts, setCounts] = useState<DenominationCounts>({});
  const [periodId, setPeriodId] = useState<string | null | undefined>(undefined);
  const pickedPeriodId = periodId === undefined ? defaultPeriodId : periodId;

  const hasDrawers = board.length > 0;
  const fallbackId = defaultDrawerChoice(board);
  const selected =
    board.find((slot) => slot.drawer.id === chosenId && slot.state === "free") ??
    board.find((slot) => slot.drawer.id === fallbackId) ??
    null;
  const drawer = selected?.drawer ?? null;
  const allTaken = hasDrawers && !fallbackId;

  // The till's standard float until the cashier types their own count.
  const shownFloat = floatText ?? (drawer && drawer.startingCash > 0 ? String(drawer.startingCash) : "");

  const choose = (id: string) => {
    setChosenId(id);
    setFloatText(null);
  };

  // Counted bill by bill, the total is the starting cash.
  const countedText = mode === "bills" ? String((countTotalCents(counts) ?? 0) / 100) : shownFloat;
  const typedPesos = countedText.trim() ? parseCashInput(countedText) : 0;
  const usual = drawer && !drawer.isZeroBalance ? floatNote(Number.isFinite(typedPesos) ? Math.round(typedPesos * 100) : null, Math.round(drawer.startingCash * 100)) : null;

  const submit = () => {
    if (isBusy || (hasDrawers && !drawer)) return;
    onClockIn(drawer?.id ?? null, drawer?.isZeroBalance ? "0" : countedText, {
      servicePeriodId: pickedPeriodId ?? null,
      denominations: mode === "bills" && !drawer?.isZeroBalance ? counts : null,
    });
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Start your shift</Text>
      <Text style={styles.meta}>
        {hasDrawers
          ? "Pick your drawer and count the cash in it before your first sale."
          : "Count the cash already in the drawer so your takings reconcile at close."}
      </Text>
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {hint ? (
        <Text style={styles.hint} accessibilityLiveRegion="polite">
          {hint}
        </Text>
      ) : null}

      {hasDrawers ? (
        <View style={styles.grid} accessibilityRole="radiogroup">
          {board.map((slot) => {
            const isSelected = slot.drawer.id === drawer?.id;
            const isFree = slot.state === "free";
            return (
              <TouchableOpacity
                key={slot.drawer.id}
                style={[styles.tile, isSelected && styles.tileSelected, !isFree && styles.tileTaken]}
                onPress={() => choose(slot.drawer.id)}
                disabled={!isFree || isBusy}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected, disabled: !isFree }}
                accessibilityLabel={`${slot.drawer.name}. ${
                  slot.state === "taken" ? `In use by ${slot.heldBy}` : describeDrawerPolicy(slot.drawer, formatPeso)
                }`}
              >
                <View style={styles.tileHead}>
                  <Icon name="drawer" size={18} color={isSelected ? colors.accent : colors.textSecondary} />
                  <Text style={styles.tileName} numberOfLines={1}>
                    {slot.drawer.name}
                  </Text>
                  {isSelected ? <Icon name="check" size={16} color={colors.accent} /> : null}
                </View>
                <Text style={styles.tileMeta} numberOfLines={2}>
                  {slot.state === "taken"
                    ? `In use · ${slot.heldBy}`
                    : slot.drawer.isZeroBalance
                      ? "Zero balance"
                      : slot.drawer.startingCash > 0
                        ? `${formatPeso(slot.drawer.startingCash)} float`
                        : "No standard float"}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      {allTaken ? (
        <Text style={styles.notice}>Every drawer is in use. Ask whoever holds one to end their shift.</Text>
      ) : drawer?.isZeroBalance ? (
        <View style={styles.zeroRow}>
          <Text style={styles.zeroAmount}>{formatPeso(0)}</Text>
          <Text style={styles.zeroText}>
            Zero-balance drawer — it starts empty and everything you take is handed over at close.
          </Text>
        </View>
      ) : (
        <>
          <Text style={styles.label}>Starting cash</Text>
          <CountModeSwitch value={mode} onChange={setMode} />
          {mode === "bills" ? (
            <DenominationCounter value={counts} onChange={setCounts} isDisabled={isBusy} />
          ) : (
          <TextInput
            style={styles.input}
            placeholder="₱0.00"
            placeholderTextColor={colors.textTertiary}
            keyboardType="decimal-pad"
            returnKeyType="done"
            value={shownFloat}
            onChangeText={setFloatText}
            onSubmitEditing={submit}
            editable={!isBusy}
            accessibilityLabel="Opening float in pesos"
          />
          )}
          {usual ? (
            <View style={[styles.usual, !usual.isUsual && styles.usualOff]} accessibilityLiveRegion="polite">
              <Icon name={usual.isUsual ? "check" : "info"} size={14} color={usual.isUsual ? colors.success : colors.statusPending.text} />
              <Text style={[styles.usualText, !usual.isUsual && styles.usualTextOff]}>{usual.text}</Text>
            </View>
          ) : null}
        </>
      )}

      {periods.length > 0 ? (
        <View style={styles.periods} accessibilityRole="radiogroup" accessibilityLabel="Which shift">
          <Text style={styles.label}>Which shift</Text>
          <View style={styles.periodChips}>
            {periods.map((period) => {
              const isOn = period.id === pickedPeriodId;
              return (
                <TouchableOpacity
                  key={period.id}
                  style={[styles.periodChip, isOn && styles.periodChipOn]}
                  onPress={() => setPeriodId(isOn ? null : period.id)}
                  disabled={isBusy}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isOn }}
                  testID={`period-${period.id}`}
                >
                  {isOn ? <Icon name="check" size={14} color={colors.textOnDark} /> : null}
                  <Text style={[styles.periodText, isOn && styles.periodTextOn]}>{period.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ) : null}

      <Button
        label={isBusy ? "Starting…" : drawer ? `Clock in to ${drawer.name}` : "Clock in"}
        onPress={submit}
        isLoading={isBusy}
        disabled={isBusy || allTaken}
        size="lg"
        fullWidth
        accessibilityLabel="Start shift"
      />

      {!hasDrawers && canManage ? (
        <TouchableOpacity
          style={styles.setup}
          onPress={onSetUpDrawers}
          accessibilityRole="button"
          accessibilityLabel="Set up cash drawers"
        >
          <Text style={styles.setupText}>More than one till? Set up Cashier 1, Cashier 2 or a zero-balance drawer</Text>
          <Icon name="chevron" size={14} color={colors.textSecondary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  title: { ...typography.heading, color: colors.textPrimary },
  meta: { ...typography.caption, color: colors.textSecondary },
  notice: { ...typography.caption, color: colors.danger, fontWeight: "600" },
  hint: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.statusPending.text,
    backgroundColor: colors.warningLight,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
  tile: {
    flexGrow: 1,
    flexBasis: "45%",
    minHeight: 72,
    borderWidth: 1.5,
    borderColor: colors.separator,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
    backgroundColor: colors.card,
  },
  tileSelected: { borderColor: colors.accent, backgroundColor: colors.accentLight },
  tileTaken: { opacity: 0.55, backgroundColor: colors.surfaceSubtle },
  tileHead: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  tileName: { ...typography.body, fontWeight: "700", color: colors.textPrimary, flex: 1 },
  tileMeta: { ...typography.caption, color: colors.textSecondary },
  label: { ...typography.eyebrow, color: colors.textTertiary, marginTop: spacing.xs },
  input: {
    ...typography.heading,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  zeroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  zeroAmount: { ...typography.heading, color: colors.textPrimary },
  zeroText: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  setup: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: 44,
    marginTop: spacing.xs,
  },
  setupText: { ...typography.caption, color: colors.textSecondary, fontWeight: "600", flex: 1 },
  usual: { flexDirection: "row", alignItems: "center", gap: spacing.xs, alignSelf: "flex-start", backgroundColor: colors.successLight, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 6 },
  usualOff: { backgroundColor: colors.warningLight, borderRadius: radius.md, alignSelf: "stretch" },
  usualText: { ...typography.caption, fontWeight: "700", color: colors.success },
  usualTextOff: { color: colors.statusPending.text, flex: 1 },
  periods: { gap: spacing.xs },
  periodChips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  periodChip: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 48, paddingHorizontal: spacing.lg, borderRadius: radius.full, borderWidth: 1, borderColor: colors.separator, backgroundColor: colors.card },
  periodChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  periodText: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  periodTextOn: { color: colors.textOnDark },
});
