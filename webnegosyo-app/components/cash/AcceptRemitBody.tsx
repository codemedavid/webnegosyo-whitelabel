import React, { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { formatCents } from "../../lib/expenses/expense-format";
import { EMPTY_KEYPAD, keypadCents, pressKey, type KeypadState } from "../../lib/expenses/keypad";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { BigAmount } from "../BigAmount";
import { Button } from "../Button";
import { Keypad } from "../Keypad";
import { OFFLINE_LINE, differenceLine, validateAccept, validateDispute } from "./accept-remit";

export interface AcceptResult {
  receivedCents: number;
  note: string | null;
}

export interface DisputeResult {
  reason: string;
}

interface AcceptRemitBodyProps {
  cashierName: string;
  /** What the slip says was handed over; null = force-closed, nobody counted. */
  handedOverCents: number | null;
  onAccept: (result: AcceptResult) => void;
  /** Offer "Something's wrong" (dispute_remittance). */
  onDispute?: (result: DisputeResult) => void;
  isOffline?: boolean;
  /** A write is in flight: every button holds. */
  isBusy?: boolean;
  /** The write's refusal, worded by the caller ("Already accepted by Maria."). */
  error?: string | null;
}

type Mode = "confirm" | "different" | "dispute";

const NOTE_MAX = 300;

function Message({ text, tone }: { text: string | null; tone: "error" | "note" }) {
  if (!text) return null;
  return (
    <Text style={tone === "error" ? styles.error : styles.note} accessibilityLiveRegion="polite">
      {text}
    </Text>
  );
}

interface DifferentProps {
  handedOverCents: number | null;
  isLocked: boolean;
  onAccept: (result: AcceptResult) => void;
  onBack: (() => void) | null;
}

function DifferentAmount({ handedOverCents, isLocked, onAccept, onBack }: DifferentProps) {
  const [typed, setTyped] = useState<KeypadState>(EMPTY_KEYPAD);
  const [note, setNote] = useState("");
  const [hasTried, setTried] = useState(false);
  // Nothing typed (or all of it deleted) is "no amount yet", never ₱0 received.
  const received = typed.whole === "" && typed.fraction === null ? null : keypadCents(typed);
  const check = validateAccept(handedOverCents, received, note);
  const confirm = () => {
    setTried(true);
    if (check.ok) onAccept({ receivedCents: check.receivedCents, note: check.note });
  };
  return (
    <View style={styles.section}>
      <View style={styles.amount}>
        <BigAmount cents={received ?? 0} color={received === null ? colors.textTertiary : colors.textPrimary} size={40} testID="accept-amount" />
      </View>
      <Message text={differenceLine(handedOverCents, received)} tone="note" />
      <Keypad mode="amount" onKey={(key) => key !== "next" && setTyped((state) => pressKey(state, key))} isDisabled={isLocked} testIDPrefix="accept-key" />
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder={handedOverCents === null ? "Note (optional)" : "What was different?"}
        placeholderTextColor={colors.textSecondary}
        maxLength={NOTE_MAX}
        style={styles.input}
        accessibilityLabel="Note for the cashier and the owner"
        editable={!isLocked}
        testID="accept-note"
      />
      <Message text={hasTried && !check.ok ? check.message : null} tone="error" />
      <Button
        label={received === null ? "Accept" : `Accept ${formatCents(received, { compact: true })}`}
        size="lg"
        onPress={confirm}
        disabled={isLocked}
        testID="accept-confirm-different"
      />
      {onBack ? <Button label="Back" tone="ghost" onPress={onBack} disabled={isLocked} testID="accept-back" /> : null}
    </View>
  );
}

function Dispute({ isLocked, onDispute, onBack }: { isLocked: boolean; onDispute: (result: DisputeResult) => void; onBack: () => void }) {
  const [reason, setReason] = useState("");
  const [hasTried, setTried] = useState(false);
  const check = validateDispute(reason);
  return (
    <View style={styles.section}>
      <Text style={styles.body}>What's wrong? The cashier and the owner will see this.</Text>
      <TextInput
        value={reason}
        onChangeText={setReason}
        placeholder='For example "envelope short"'
        placeholderTextColor={colors.textSecondary}
        maxLength={NOTE_MAX}
        style={styles.input}
        accessibilityLabel="What's wrong"
        editable={!isLocked}
        testID="accept-dispute-reason"
      />
      <Message text={hasTried && !check.ok ? check.message : null} tone="error" />
      <Button
        label="Report a problem"
        tone="danger"
        size="lg"
        onPress={() => {
          setTried(true);
          if (check.ok) onDispute({ reason: check.reason });
        }}
        disabled={isLocked}
        testID="accept-confirm-dispute"
      />
      <Button label="Back" tone="ghost" onPress={onBack} disabled={isLocked} testID="accept-back" />
    </View>
  );
}

/**
 * The body of the receiver's Accept sheet (the screen owner wraps it in a
 * DrawerSheet). "Did you receive ₱6,345 from Ana?" → Yes (one tap, exactly the
 * slip) · "I got a different amount" (keypad + note, the gap spelled out) ·
 * "Something's wrong" (dispute). A force-closed shift has no slip amount, so
 * the receiver's own count is asked for straight away.
 */
export function AcceptRemitBody({ cashierName, handedOverCents, onAccept, onDispute, isOffline = false, isBusy = false, error = null }: AcceptRemitBodyProps) {
  const [mode, setMode] = useState<Mode>(handedOverCents === null ? "different" : "confirm");
  const isLocked = isOffline || isBusy;
  const status = (
    <>
      <Message text={isOffline ? OFFLINE_LINE : null} tone="note" />
      <Message text={error} tone="error" />
    </>
  );

  if (handedOverCents === null || mode === "different") {
    return (
      <View style={styles.wrap} testID="accept-remit">
        <Text style={styles.question}>
          {handedOverCents === null ? `Count what ${cashierName} handed over.` : `How much did you get from ${cashierName}?`}
        </Text>
        {status}
        <DifferentAmount handedOverCents={handedOverCents} isLocked={isLocked} onAccept={onAccept} onBack={handedOverCents === null ? null : () => setMode("confirm")} />
      </View>
    );
  }
  if (mode === "dispute" && onDispute) {
    return (
      <View style={styles.wrap} testID="accept-remit">
        <Text style={styles.question}>{`Something's wrong with ${cashierName}'s remittance?`}</Text>
        {status}
        <Dispute isLocked={isLocked} onDispute={onDispute} onBack={() => setMode("confirm")} />
      </View>
    );
  }

  const amount = formatCents(handedOverCents, { compact: true });
  return (
    <View style={styles.wrap} testID="accept-remit">
      <Text style={styles.question}>{`Did you receive ${amount} from ${cashierName}?`}</Text>
      {status}
      <Button
        label={`Yes, I received ${amount}`}
        size="lg"
        icon="check"
        onPress={() => onAccept({ receivedCents: handedOverCents, note: null })}
        disabled={isLocked}
        isLoading={isBusy}
        testID="accept-yes"
      />
      <Button label="I got a different amount" tone="secondary" size="lg" onPress={() => setMode("different")} disabled={isLocked} testID="accept-different" />
      {onDispute ? <Button label="Something's wrong" tone="ghost" onPress={() => setMode("dispute")} disabled={isLocked} testID="accept-dispute" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  section: { gap: spacing.md },
  question: { ...typography.title, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textPrimary },
  amount: { alignItems: "center", paddingVertical: spacing.sm },
  input: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.separator, backgroundColor: colors.surfaceSubtle, paddingHorizontal: spacing.md, ...typography.body, color: colors.textPrimary },
  error: { ...typography.caption, color: colors.danger, fontWeight: "600" },
  note: { ...typography.caption, color: colors.textMuted },
});
