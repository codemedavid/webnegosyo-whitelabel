import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { slipTime } from "../../lib/cash-slips/slip-text";
import { formatCents } from "../../lib/expenses/expense-format";
import { parsePesoInput } from "../../lib/expenses/keypad";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import {
  markAllNonCash,
  setNonCashCheck,
  setNonCashDeclared,
  setNonCashNote,
  type NonCashAnswer,
  type NonCashReference,
} from "./non-cash";

interface NonCashCheckProps {
  /** From `initialNonCashAnswers(preview.nonCashByMethod)`; null = not loaded yet. */
  value: readonly NonCashAnswer[] | null;
  onChange: (answers: readonly NonCashAnswer[]) => void;
  /** Payments per method key, for "Show references". */
  references?: Readonly<Record<string, readonly NonCashReference[]>>;
  isDisabled?: boolean;
}

export const LOADING_LINE = "Adding up GCash, Maya and cards…";
export const NONE_LINE = "No GCash, Maya or card payments this shift.";
export const BAD_AMOUNT_LINE = "Type an amount like 4,150";
const NOTE_MAX = 300;

function payments(count: number): string {
  return `${count} ${count === 1 ? "payment" : "payments"}`;
}

function Choice({ label, isOn, onPress, isDisabled, testID }: { label: string; isOn: boolean; onPress: () => void; isDisabled: boolean; testID: string }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={[styles.choice, isOn && styles.choiceOn]}
      accessibilityRole="radio"
      accessibilityState={{ checked: isOn, disabled: isDisabled }}
      accessibilityLabel={label}
      testID={testID}
    >
      <Text style={[styles.choiceText, isOn && styles.choiceTextOn]}>{label}</Text>
    </Pressable>
  );
}

function References({ items }: { items: readonly NonCashReference[] }) {
  return (
    <View style={styles.references}>
      {items.map((item, index) => (
        <Text key={`${item.at}-${index}`} style={styles.reference}>
          {[slipTime(item.at), item.ref, formatCents(item.cents, { compact: true })].filter(Boolean).join(" · ")}
        </Text>
      ))}
    </View>
  );
}

interface RowProps {
  answer: NonCashAnswer;
  references: readonly NonCashReference[];
  isDisabled: boolean;
  onCheck: (check: "matches" | "different") => void;
  onDeclared: (cents: number | null) => void;
  onNote: (note: string) => void;
}

function MethodRow({ answer, references, isDisabled, onCheck, onDeclared, onNote }: RowProps) {
  const [typed, setTyped] = useState(answer.declaredCents === null ? "" : String(answer.declaredCents / 100));
  const [isShowingRefs, setShowingRefs] = useState(false);
  const isBad = typed.trim() !== "" && parsePesoInput(typed) === null;
  const id = `non-cash-${answer.key}`;

  const changeAmount = (text: string) => {
    setTyped(text);
    onDeclared(text.trim() === "" ? null : parsePesoInput(text));
  };

  return (
    <View style={styles.row} testID={id}>
      <View style={styles.rowHead}>
        <View style={styles.rowText}>
          <Text style={styles.method}>{answer.label}</Text>
          <Text style={styles.meta}>{`${formatCents(answer.expectedCents, { compact: true })} · ${payments(answer.count)}`}</Text>
        </View>
        <View style={styles.choices} accessibilityRole="radiogroup" accessibilityLabel={`${answer.label} matches your app?`}>
          <Choice label="Matches" isOn={answer.check === "matches"} onPress={() => onCheck("matches")} isDisabled={isDisabled} testID={`${id}-matches`} />
          <Choice label="Different" isOn={answer.check === "different"} onPress={() => onCheck("different")} isDisabled={isDisabled} testID={`${id}-different`} />
        </View>
      </View>
      {answer.check === "different" ? (
        <View style={styles.different}>
          <TextInput
            value={typed}
            onChangeText={changeAmount}
            keyboardType="decimal-pad"
            placeholder="What your app shows, e.g. 4,150"
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, isBad && styles.inputBad]}
            accessibilityLabel={`${answer.label} amount you see`}
            editable={!isDisabled}
            testID={`${id}-amount`}
          />
          {isBad ? <Text style={styles.error}>{BAD_AMOUNT_LINE}</Text> : null}
          <TextInput
            value={answer.note}
            onChangeText={onNote}
            placeholder="What's different?"
            placeholderTextColor={colors.textSecondary}
            maxLength={NOTE_MAX}
            style={styles.input}
            accessibilityLabel={`What's different about ${answer.label}?`}
            editable={!isDisabled}
            testID={`${id}-note`}
          />
        </View>
      ) : null}
      {references.length > 0 ? (
        <Pressable onPress={() => setShowingRefs((shown) => !shown)} hitSlop={12} accessibilityRole="button" testID={`${id}-references`}>
          <Text style={styles.link}>{isShowingRefs ? "Hide references" : "Show references"}</Text>
        </Pressable>
      ) : null}
      {isShowingRefs ? <References items={references} /> : null}
    </View>
  );
}

/**
 * "Do GCash, Maya and card match what you see?" One row per method with
 * Matches / Different; All match on top for the usual case; "I'll leave this to
 * the owner" leaves every row unchecked. Controlled; `non-cash.ts` holds the rules.
 */
export function NonCashCheck({ value, onChange, references = {}, isDisabled = false }: NonCashCheckProps) {
  if (value === null) return <Text style={styles.note}>{LOADING_LINE}</Text>;
  if (value.length === 0) return <Text style={styles.note}>{NONE_LINE}</Text>;
  return (
    <View style={styles.wrap} testID="non-cash-check">
      <Button label="All match" tone="secondary" icon="check" onPress={() => onChange(markAllNonCash(value, "matches"))} disabled={isDisabled} testID="non-cash-all-match" />
      {value.map((answer) => (
        <MethodRow
          key={answer.key}
          answer={answer}
          references={references[answer.key] ?? []}
          isDisabled={isDisabled}
          onCheck={(check) => onChange(setNonCashCheck(value, answer.key, check))}
          onDeclared={(cents) => onChange(setNonCashDeclared(value, answer.key, cents))}
          onNote={(note) => onChange(setNonCashNote(value, answer.key, note))}
        />
      ))}
      <Button label="I'll leave this to the owner" tone="ghost" onPress={() => onChange(markAllNonCash(value, "unchecked"))} disabled={isDisabled} testID="non-cash-skip" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  row: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  rowHead: { flexDirection: "row", alignItems: "center", gap: spacing.md, flexWrap: "wrap" },
  rowText: { flex: 1, minWidth: 120 },
  method: { ...typography.heading, color: colors.textPrimary },
  meta: { ...typography.caption, color: colors.textMuted, fontVariant: ["tabular-nums"] },
  choices: { flexDirection: "row", gap: spacing.sm },
  choice: { minHeight: 44, paddingHorizontal: spacing.md, borderRadius: radius.full, borderWidth: 1, borderColor: colors.separator, backgroundColor: colors.card, justifyContent: "center" },
  choiceOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  choiceText: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
  choiceTextOn: { color: colors.textOnDark },
  different: { gap: spacing.sm },
  input: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.separator, backgroundColor: colors.surfaceSubtle, paddingHorizontal: spacing.md, ...typography.body, color: colors.textPrimary },
  inputBad: { borderColor: colors.danger },
  error: { ...typography.caption, color: colors.danger, fontWeight: "600" },
  link: { ...typography.caption, fontWeight: "700", color: colors.textPrimary, textDecorationLine: "underline" },
  references: { gap: 4, paddingLeft: spacing.sm },
  reference: { ...typography.caption, color: colors.textMuted, fontVariant: ["tabular-nums"] },
  note: { ...typography.body, color: colors.textMuted },
});
