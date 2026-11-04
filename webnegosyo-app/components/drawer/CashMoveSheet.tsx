import React, { useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import {
  CASH_MOVE_COPY,
  CASH_MOVE_REASON_MAX,
  validateCashMove,
  type CashMoveKind,
} from "../../lib/cash-drawers";
import { parseCashInput } from "../../lib/shift";
import { formatPeso } from "../../lib/format";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { Icon, type IconName } from "../Icon";
import { SegmentedControl } from "../SegmentedControl";
import { AmountChips, CashInput, DrawerSheet, sheetText } from "./DrawerSheet";
import { PICKUP_COPY, pickupTakerProblem, type PickupTaker } from "../../lib/cash/shift-pickup";

/** Someone who may take a pickup: a cash manager with reach to this branch. */
export interface PickupReceiver {
  userId: string;
  name: string;
  presence?: string | null;
}

export interface CashMoveTarget {
  shiftId: string;
  title: string;
  subtitle: string;
  /** Which moves this sheet offers, first = default. */
  kinds: readonly CashMoveKind[];
  /** What the drawer should hold now; null while unknown. */
  expectedInDrawer: number | null;
  floatToKeep: number;
}

interface CashMoveSheetProps {
  target: CashMoveTarget | null;
  isBusy: boolean;
  onSubmit: (move: { kind: CashMoveKind; amount: number; reason: string; takenBy: PickupTaker | null }) => void;
  /**
   * Who may take a pickup. Present = the store records "Taken by" and the
   * pickup becomes a remittance to accept; absent = the plain move as before.
   */
  pickupReceivers?: readonly PickupReceiver[];
  onClose: () => void;
  /**
   * Cash taken out that is not an expense (owner, bank deposit, loan), in the
   * expense sheet. Absent = this store has no expenses yet, and the old
   * free-text "Pay out" stays in `target.kinds`. Paying an expense is NOT a
   * door here: it has one way in, "Pay an expense" on the shift card (and the
   * register's "Pay out", which opens that same sheet).
   */
  onTakeOut?: () => void;
}

/** Pickup presets: everything, or everything but the float the next sale needs for change. */
function pickupChips(expected: number | null, floatToKeep: number): { label: string; amount: number }[] {
  if (expected === null || expected <= 0) return [];
  const chips = [{ label: `All ${formatPeso(expected)}`, amount: expected }];
  const aboveFloat = Math.round((expected - floatToKeep) * 100) / 100;
  if (floatToKeep > 0 && aboveFloat > 0) {
    chips.push({ label: `Leave float · ${formatPeso(aboveFloat)}`, amount: aboveFloat });
  }
  return chips;
}

/**
 * Cash in or out of a drawer without a sale: an owner's pickup, a safe drop,
 * a pay out for supplies, coins added for change. Every one is recorded so
 * the count at close still balances — the best-practice alternative to
 * "just take some cash and remember".
 */
export function CashMoveSheet({ target, isBusy, onSubmit, onClose, onTakeOut, pickupReceivers }: CashMoveSheetProps) {
  const [kind, setKind] = useState<CashMoveKind>(target?.kinds[0] ?? "collect");
  const [taker, setTaker] = useState<PickupTaker | null>(null);
  const [amountText, setAmountText] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!target) return null;

  const copy = CASH_MOVE_COPY[kind];
  const amount = amountText.trim() ? parseCashInput(amountText) : Number.NaN;
  const chips = kind === "collect" ? pickupChips(target.expectedInDrawer, target.floatToKeep) : [];

  const submit = () => {
    if (isBusy) return;
    const verdict = validateCashMove({ kind, amount, reason }, target.expectedInDrawer);
    if (!verdict.ok) {
      setError(verdict.reason);
      return;
    }
    const isPickup = kind === "collect";
    const takerProblem = pickupTakerProblem(taker, isPickup && pickupReceivers !== undefined);
    if (takerProblem) {
      setError(takerProblem);
      return;
    }
    setError(null);
    onSubmit({ kind, amount: verdict.value.amount, reason, takenBy: isPickup ? taker : null });
  };

  const submitLabel = Number.isFinite(amount) && amount > 0 ? `${copy.verb} ${formatPeso(amount)}` : copy.verb;

  return (
    <DrawerSheet visible title={target.title} subtitle={target.subtitle} onClose={onClose} isBusy={isBusy}>
      {onTakeOut ? (
        <View style={styles.doors}>
          <MoveDoor
            icon="wallet"
            title="Take out cash"
            hint="Owner took cash, bank deposit, loan payment"
            onPress={onTakeOut}
            isDisabled={isBusy}
          />
        </View>
      ) : null}
      {target.kinds.length > 1 ? (
        <SegmentedControl
          options={target.kinds.map((k) => ({ label: CASH_MOVE_COPY[k].label, value: k }))}
          value={kind}
          onChange={(next) => {
            setKind(next);
            setError(null);
          }}
          accessibilityPrefix="Cash move"
        />
      ) : null}
      <Text style={sheetText.hint}>{copy.hint}</Text>
      {target.expectedInDrawer !== null ? (
        <Text style={styles.holding}>Drawer should hold {formatPeso(target.expectedInDrawer)} now</Text>
      ) : null}

      <Text style={sheetText.label}>Amount</Text>
      <CashInput
        value={amountText}
        onChangeText={(next) => {
          setAmountText(next);
          setError(null);
        }}
        autoFocus
        editable={!isBusy}
        hasError={Boolean(error)}
        accessibilityLabel={`${copy.label} amount in pesos`}
      />
      <AmountChips chips={chips} onPick={(value) => setAmountText(value.toFixed(2))} />

      {kind === "collect" && pickupReceivers ? (
        <TakenBy
          receivers={pickupReceivers}
          value={taker}
          onChange={(next) => {
            setTaker(next);
            setError(null);
          }}
          isDisabled={isBusy}
        />
      ) : null}

      <Text style={sheetText.label}>{kind === "collect" ? "Note (optional)" : "What for?"}</Text>
      <TextInput
        style={styles.reason}
        value={reason}
        onChangeText={(next) => {
          setReason(next);
          setError(null);
        }}
        placeholder={kind === "pay_out" ? "e.g. Ice, LPG refill" : kind === "pay_in" ? "e.g. Coins for change" : "e.g. Midday pickup"}
        placeholderTextColor={colors.textTertiary}
        maxLength={CASH_MOVE_REASON_MAX}
        editable={!isBusy}
        accessibilityLabel="Reason"
      />
      {error ? <Text style={sheetText.error}>{error}</Text> : null}

      <Button
        label={submitLabel}
        onPress={submit}
        isLoading={isBusy}
        disabled={isBusy}
        size="lg"
        fullWidth
        accessibilityLabel={`Record ${copy.label.toLowerCase()}`}
        style={styles.submit}
      />
    </DrawerSheet>
  );
}

/** "Taken by": chips for each receiver here, then the store safe. Required. */
function TakenBy({
  receivers,
  value,
  onChange,
  isDisabled,
}: {
  receivers: readonly PickupReceiver[];
  value: PickupTaker | null;
  onChange: (taker: PickupTaker) => void;
  isDisabled: boolean;
}) {
  const options: { key: string; label: string; meta: string | null; taker: PickupTaker }[] = [
    ...receivers.map((r) => ({ key: r.userId, label: r.name, meta: r.presence ?? null, taker: { kind: "person" as const, userId: r.userId, name: r.name } })),
    { key: "safe", label: PICKUP_COPY.safe, meta: null, taker: { kind: "safe" as const } },
  ];
  const isOn = (taker: PickupTaker) =>
    value !== null && value.kind === taker.kind && (taker.kind === "safe" || (value.kind === "person" && value.userId === taker.userId));
  return (
    <View style={styles.takenBy} accessibilityRole="radiogroup" accessibilityLabel={PICKUP_COPY.label}>
      <Text style={sheetText.label}>{PICKUP_COPY.label}</Text>
      <View style={styles.takers}>
        {options.map((option) => {
          const selected = isOn(option.taker);
          return (
            <TouchableOpacity
              key={option.key}
              style={[styles.taker, selected && styles.takerOn]}
              onPress={() => onChange(option.taker)}
              disabled={isDisabled}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: isDisabled }}
              accessibilityLabel={option.meta ? `${option.label}, ${option.meta}` : option.label}
              testID={`taken-by-${option.key}`}
            >
              {selected ? <Icon name="check" size={14} color={colors.textOnDark} /> : null}
              <Text style={[styles.takerText, selected && styles.takerTextOn]} numberOfLines={1}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function MoveDoor({
  icon,
  title,
  hint,
  onPress,
  isDisabled,
}: {
  icon: IconName;
  title: string;
  hint: string;
  onPress: () => void;
  isDisabled: boolean;
}) {
  return (
    <TouchableOpacity
      style={styles.door}
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={hint}
    >
      <View style={styles.doorIcon}>
        <Icon name={icon} size={20} color={colors.textPrimary} />
      </View>
      <View style={styles.doorCopy}>
        <Text style={styles.doorTitle}>{title}</Text>
        <Text style={styles.doorHint} numberOfLines={2}>
          {hint}
        </Text>
      </View>
      <Icon name="chevron" size={16} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  doors: { gap: spacing.sm, marginBottom: spacing.sm },
  door: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    minHeight: 64,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.surfaceSubtle,
  },
  doorIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  doorCopy: { flex: 1, gap: 2 },
  doorTitle: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  doorHint: { ...typography.caption, color: colors.textMuted },
  holding: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
  reason: {
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  submit: { marginTop: spacing.md },
  takenBy: { gap: spacing.xs },
  takers: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  taker: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.card,
  },
  takerOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  takerText: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  takerTextOn: { color: colors.textOnDark },
});
