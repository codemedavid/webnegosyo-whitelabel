import React, { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { CountModeSwitch } from "../cash/CountModeSwitch";
import { DenominationCounter } from "../cash/DenominationCounter";
import { NonCashCheck } from "../cash/NonCashCheck";
import { markAllNonCash, type NonCashAnswer } from "../cash/non-cash";
import { ReasonChips } from "../cash/ReasonChips";
import { RemitToPicker } from "../cash/RemitToPicker";
import type { CashReceiver, RemitHow, RemitTarget } from "../cash/remit-target";
import { VerdictCard } from "../cash/VerdictCard";
import { BigAmount } from "../BigAmount";
import { Button } from "../Button";
import { Keypad, type KeypadPress } from "../Keypad";
import { EMPTY_KEYPAD, formatPeso, keypadCents, keypadFromCents, parsePesoInput, pressKey, type KeypadState } from "../../lib/expenses/keypad";
import type { ShiftClosePreview, ShiftCountResult } from "../../lib/cash/shift-close-parse";
import { checkFloatKept, type EndShiftDraft } from "../../lib/cash/shift-end-flow";
import type { VarianceReasonKey } from "../../lib/cash/reasons";
import { colors, radius, spacing, typography } from "../../theme/colors";

export const COUNT_HINT = "Count everything in the drawer, float included.";
export const BLIND_HINT = "We'll compare after you finish.";

/** "Should be ₱8,465" when the store shows it; blind says nothing about the figure. */
export function countHint(preview: ShiftClosePreview | null): string {
  if (!preview) return COUNT_HINT;
  if (preview.hidden || preview.expectedCents === null) return BLIND_HINT;
  return `Should be ${formatPeso(preview.expectedCents)}`;
}

// ── Step 1: Count cash ─────────────────────────────────────────────────────

interface CountStepProps {
  draft: EndShiftDraft;
  preview: ShiftClosePreview | null;
  onChange: (change: (draft: EndShiftDraft) => EndShiftDraft) => void;
  isTablet: boolean;
  onDone: () => void;
  /** The store requires counting bills and coins: no "Type total". */
  isBillsRequired?: boolean;
}

export function CountStep({ draft, preview, onChange, isTablet, onDone, isBillsRequired = false }: CountStepProps) {
  const mode = isBillsRequired ? "bills" : draft.mode;
  return (
    <View style={styles.step}>
      {isBillsRequired ? null : <CountModeSwitch value={draft.mode} onChange={(next) => onChange((d) => ({ ...d, mode: next }))} />}
      <Text style={styles.hint}>{COUNT_HINT}</Text>
      {mode === "bills" ? (
        <DenominationCounter
          value={draft.counts}
          onChange={(counts) => onChange((d) => ({ ...d, counts }))}
          hint={countHint(preview)}
          isTablet={isTablet}
          onDone={onDone}
          doneLabel="Next"
        />
      ) : (
        <TypedTotal cents={draft.typedCents} hint={countHint(preview)} onChange={(typedCents) => onChange((d) => ({ ...d, typedCents }))} />
      )}
    </View>
  );
}

function TypedTotal({ cents, hint, onChange }: { cents: number | null; hint: string; onChange: (cents: number | null) => void }) {
  const [state, setState] = useState<KeypadState>(() => (cents === null ? EMPTY_KEYPAD : keypadFromCents(cents)));
  const press = (key: KeypadPress) => {
    if (key === "next") return;
    const next = pressKey(state, key);
    setState(next);
    onChange(next.whole === "" && next.fraction === null ? null : keypadCents(next));
  };
  return (
    <View style={styles.typed} testID="end-shift-typed">
      <View style={styles.typedHero}>
        <Text style={styles.eyebrowInk}>Counted</Text>
        <BigAmount cents={cents ?? 0} color={cents === null ? colors.heroInkMuted : colors.heroInkText} />
        <Text style={styles.inkHint}>{hint}</Text>
      </View>
      <Keypad mode="amount" onKey={press} testIDPrefix="end-shift-key" />
    </View>
  );
}

// ── Step 2: GCash & cards ──────────────────────────────────────────────────

interface NonCashStepProps {
  answers: readonly NonCashAnswer[] | null;
  onChange: (answers: readonly NonCashAnswer[]) => void;
}

export function NonCashStep({ answers, onChange }: NonCashStepProps) {
  return (
    <View style={styles.step}>
      <Text style={styles.title}>Check GCash, Maya and cards</Text>
      <Text style={styles.hint}>Compare each with your GCash app, Maya and the card terminal.</Text>
      {answers && answers.length > 0 ? (
        <Button label="All match" icon="check" tone="secondary" size="lg" onPress={() => onChange(markAllNonCash(answers, "matches"))} testID="end-shift-all-match" />
      ) : null}
      <NonCashCheck value={answers} onChange={onChange} />
      {answers && answers.length > 0 ? (
        <Button label="I'll leave this to the owner" tone="ghost" onPress={() => onChange(markAllNonCash(answers, "unchecked"))} />
      ) : null}
    </View>
  );
}

// ── Step 3: Result ─────────────────────────────────────────────────────────

interface ResultStepProps {
  count: ShiftCountResult;
  /** "Counted twice: ₱0 → ₱8,345" once a recount changed the figure. */
  recountText?: string | null;
  /** Recount is offered once (attempt 1) and first on a Short. */
  onRecount?: () => void;
  reasonKey: VarianceReasonKey | null;
  note: string;
  onReason: (key: VarianceReasonKey | null) => void;
  onNote: (note: string) => void;
  reasonError: string | null;
  thresholdCents: number;
  isZeroBalance: boolean;
  floatKeptCents: number;
  handoverCents: number;
  onFloatKept: (cents: number) => void;
}

export function ResultStep(props: ResultStepProps) {
  const { count } = props;
  const hasDifference = count.differenceCents !== null && count.differenceCents !== 0;
  return (
    <View style={styles.step}>
      <VerdictCard expectedCents={count.expectedCents} countedCents={count.countedCents} onRecount={props.onRecount} />
      {count.attempt === 2 ? (
        <View style={styles.recount} testID="end-shift-recount">
          {props.recountText ? <Text style={styles.recountText}>{props.recountText}</Text> : null}
          <Text style={styles.hint}>This is your recount. The owner sees both counts.</Text>
        </View>
      ) : null}
      {hasDifference ? (
        <ReasonChips
          differenceCents={count.differenceCents as number}
          value={props.reasonKey}
          onChange={props.onReason}
          thresholdCents={props.thresholdCents}
          note={props.note}
          onNoteChange={props.onNote}
          error={props.reasonError}
        />
      ) : null}
      <Handover {...props} />
    </View>
  );
}

function Handover({ isZeroBalance, floatKeptCents, handoverCents, count, onFloatKept }: ResultStepProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(String(floatKeptCents / 100));
  const typed = parsePesoInput(text);
  const problem = typed === null ? "Type an amount like 2,000" : checkFloatKept(typed, count.countedCents);
  if (isZeroBalance) {
    return (
      <View style={styles.handover} testID="end-shift-handover">
        <Text style={styles.handoverText}>{`Remit all ${formatPeso(count.countedCents)}. This drawer ends empty.`}</Text>
      </View>
    );
  }
  return (
    <View style={styles.handover} testID="end-shift-handover">
      <Text style={styles.handoverText}>
        {`Keep ${formatPeso(floatKeptCents)} for the next shift. `}
        <Text style={styles.strong}>{`Remit ${formatPeso(handoverCents)}.`}</Text>
      </Text>
      {isEditing ? (
        <View style={styles.floatEdit}>
          <TextInput
            style={[styles.input, problem ? styles.inputBad : null]}
            value={text}
            onChangeText={setText}
            keyboardType="decimal-pad"
            accessibilityLabel="Float to keep for the next shift"
          />
          <Button
            label="Keep this"
            size="lg"
            fullWidth={false}
            disabled={problem !== null}
            onPress={() => {
              if (typed === null) return;
              onFloatKept(typed);
              setIsEditing(false);
            }}
          />
        </View>
      ) : (
        <Button label={`Keep ${formatPeso(floatKeptCents)} · change`} tone="ghost" onPress={() => setIsEditing(true)} />
      )}
      {isEditing && problem ? <Text style={styles.error}>{problem}</Text> : null}
    </View>
  );
}

// ── Step 4: Remit ──────────────────────────────────────────────────────────

interface RemitStepProps {
  receivers: readonly CashReceiver[] | null;
  receiversError: string | null;
  target: RemitTarget | null;
  onTarget: (target: RemitTarget) => void;
  how: RemitHow;
  onHow: (how: RemitHow) => void;
  isOffline: boolean;
  handoverCents: number;
  /** Remittances switched off: the shift just ends. */
  isRemitOff: boolean;
}

export function RemitStep(props: RemitStepProps) {
  if (props.isRemitOff) {
    return (
      <View style={styles.step}>
        <Text style={styles.title}>{`Hand over ${formatPeso(props.handoverCents)}`}</Text>
        <Text style={styles.hint}>{"This store doesn’t record who receives the cash. End your shift when you’ve handed it over."}</Text>
      </View>
    );
  }
  return (
    <View style={styles.step}>
      <RemitToPicker
        receivers={props.receivers}
        value={props.target}
        onChange={props.onTarget}
        how={props.how}
        onHowChange={props.onHow}
        isOffline={props.isOffline}
        loadError={props.receiversError}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  step: { gap: spacing.md },
  title: { ...typography.heading, color: colors.textPrimary },
  hint: { ...typography.caption, color: colors.textMuted },
  recount: { gap: 2 },
  recountText: { ...typography.body, fontWeight: "700", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  typed: { gap: spacing.md },
  typedHero: { backgroundColor: colors.heroInk, borderRadius: radius.lg, padding: spacing.lg, gap: 4 },
  eyebrowInk: { ...typography.eyebrow, color: colors.heroInkMuted },
  inkHint: { ...typography.caption, color: colors.heroInkText, fontWeight: "600" },
  handover: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.separator, padding: spacing.lg, gap: spacing.sm },
  handoverText: { ...typography.body, color: colors.textPrimary },
  strong: { fontWeight: "800" },
  floatEdit: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  input: {
    flex: 1,
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: spacing.md,
    ...typography.heading,
    color: colors.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  inputBad: { borderColor: colors.danger },
  error: { ...typography.caption, color: colors.danger, fontWeight: "600" },
});
