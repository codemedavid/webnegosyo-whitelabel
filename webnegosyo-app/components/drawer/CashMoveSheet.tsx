import React, { useState } from "react";
import { StyleSheet, Text, TextInput } from "react-native";

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
import { SegmentedControl } from "../SegmentedControl";
import { AmountChips, CashInput, DrawerSheet, sheetText } from "./DrawerSheet";

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
  onSubmit: (move: { kind: CashMoveKind; amount: number; reason: string }) => void;
  onClose: () => void;
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
export function CashMoveSheet({ target, isBusy, onSubmit, onClose }: CashMoveSheetProps) {
  const [kind, setKind] = useState<CashMoveKind>(target?.kinds[0] ?? "collect");
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
    setError(null);
    onSubmit({ kind, amount: verdict.value.amount, reason });
  };

  const submitLabel = Number.isFinite(amount) && amount > 0 ? `${copy.verb} ${formatPeso(amount)}` : copy.verb;

  return (
    <DrawerSheet visible title={target.title} subtitle={target.subtitle} onClose={onClose} isBusy={isBusy}>
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

const styles = StyleSheet.create({
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
});
