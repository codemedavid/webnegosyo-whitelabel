import React, { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { formatCents } from "../../lib/expenses/expense-format";
import { keypadCents, keypadFromCents, pressKey, type KeypadState } from "../../lib/expenses/keypad";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { BigAmount } from "../BigAmount";
import { Button } from "../Button";
import { Keypad } from "../Keypad";
import { SegmentedControl } from "../SegmentedControl";
import { DEPOSIT_TEXT_MAX, OFFLINE_LINE, buildDeposit, depositGapLine, type DayDeposit, type DepositMode } from "./deposit";

interface DepositBodyProps {
  /** The day close's "Cash to deposit"; the amount starts here. */
  cashToDepositCents: number;
  /** → record_day_deposit(p_cents = cents, p_to = to, p_ref = ref, p_proof_url = the photo the screen uploaded). */
  onSubmit: (deposit: DayDeposit) => void;
  /** The screen picks and uploads the slip photo (the app's existing image upload). */
  onAddPhoto?: () => void;
  /** "Photo added" once the screen holds one. */
  photoLabel?: string | null;
  isOffline?: boolean;
  isBusy?: boolean;
  error?: string | null;
}

const MODES: readonly { label: string; value: DepositMode }[] = [
  { label: "Bank deposit", value: "bank" },
  { label: "Kept in safe", value: "safe" },
  { label: "Split", value: "split" },
];

function centsOf(state: KeypadState): number | null {
  return state.whole === "" && state.fraction === null ? null : keypadCents(state);
}

function Field({ value, onChange, placeholder, label, testID, isDisabled }: { value: string; onChange: (text: string) => void; placeholder: string; label: string; testID: string; isDisabled: boolean }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={colors.textSecondary}
      maxLength={DEPOSIT_TEXT_MAX}
      style={styles.input}
      accessibilityLabel={label}
      editable={!isDisabled}
      testID={testID}
    />
  );
}

/**
 * The body of the day's deposit sheet: Bank deposit | Kept in safe | Split,
 * the amount (starting at cash to deposit, typed on the shared keypad), where
 * it went and a reference, the slip photo, and one Record button. A different
 * amount is said plainly ("₱150 less than cash to deposit.").
 */
export function DepositBody({ cashToDepositCents, onSubmit, onAddPhoto, photoLabel, isOffline = false, isBusy = false, error = null }: DepositBodyProps) {
  const [mode, setMode] = useState<DepositMode>("bank");
  const [amount, setAmount] = useState<KeypadState>(() => keypadFromCents(cashToDepositCents));
  const [bankName, setBankName] = useState("");
  const [reference, setReference] = useState("");
  const [hasTried, setTried] = useState(false);
  const cents = centsOf(amount);
  const check = buildDeposit({ mode, cents, bankName, reference, cashToDepositCents });
  const isLocked = isOffline || isBusy;
  const gap = mode === "split" ? null : depositGapLine(cashToDepositCents, cents);
  const kept = mode === "split" && cents !== null && cents < cashToDepositCents ? `${formatCents(cashToDepositCents - cents, { compact: true })} stays in the safe.` : null;

  const save = () => {
    setTried(true);
    if (!isLocked && check.ok) onSubmit(check.deposit);
  };

  return (
    <View style={styles.wrap} testID="deposit-body">
      <SegmentedControl options={MODES} value={mode} onChange={setMode} accessibilityPrefix="Deposit" />
      <View style={styles.amount}>
        <BigAmount cents={cents ?? 0} color={cents === null ? colors.textTertiary : colors.textPrimary} size={40} testID="deposit-amount" />
        <Text style={styles.caption}>{`Cash to deposit ${formatCents(cashToDepositCents, { compact: true })}`}</Text>
      </View>
      {gap ? <Text style={styles.note}>{gap}</Text> : null}
      {kept ? <Text style={styles.note}>{kept}</Text> : null}
      <Keypad mode="amount" onKey={(key) => key !== "next" && setAmount((state) => pressKey(state, key))} isDisabled={isLocked} testIDPrefix="deposit-key" />
      {mode !== "safe" ? (
        <Field value={bankName} onChange={setBankName} placeholder="Bank or account, e.g. BDO savings" label="Bank or account" testID="deposit-bank" isDisabled={isLocked} />
      ) : null}
      <Field value={reference} onChange={setReference} placeholder="Reference (optional)" label="Deposit reference" testID="deposit-ref" isDisabled={isLocked} />
      {onAddPhoto ? (
        <Button label={photoLabel ?? "Add deposit slip photo"} tone="secondary" icon="camera" onPress={onAddPhoto} disabled={isLocked} testID="deposit-photo" />
      ) : null}
      {isOffline ? <Text style={styles.note}>{OFFLINE_LINE}</Text> : null}
      {hasTried && !check.ok ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {check.message}
        </Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button
        label={cents === null ? "Record deposit" : `Record deposit ${formatCents(cents, { compact: true })}`}
        size="lg"
        onPress={save}
        disabled={isLocked}
        isLoading={isBusy}
        testID="deposit-save"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  amount: { alignItems: "center", gap: 2, paddingVertical: spacing.sm },
  caption: { ...typography.caption, color: colors.textMuted },
  note: { ...typography.caption, color: colors.textMuted },
  error: { ...typography.caption, color: colors.danger, fontWeight: "600" },
  input: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.separator, backgroundColor: colors.surfaceSubtle, paddingHorizontal: spacing.md, ...typography.body, color: colors.textPrimary },
});
