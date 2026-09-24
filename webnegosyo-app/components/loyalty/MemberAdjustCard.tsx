import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from "react-native";
import { colors, typography, spacing, radius } from "../../theme/colors";
import {
  newAdjustmentRequestId,
  type LoyaltyMemberProgress,
} from "../../lib/loyalty/members";
import { adjustMemberBalance } from "../../lib/loyalty/members-repo";

/**
 * Add or take away stamps by hand, with the reason on the record.
 *
 * The request id is minted when the form OPENS, not when Save is pressed, and
 * it is reused for every retry of that one intent. That is the whole
 * idempotency story: the platform refuses a second write with the same id, so
 * a double tap or a retry over a flaky connection cannot double a balance.
 * Mint it per press and the defence disappears.
 *
 * Crossing the threshold here issues the reward, exactly as a real visit does.
 */
export function MemberAdjustCard({
  tenantId,
  customerKey,
  programs,
  onChanged,
}: {
  tenantId: string | null;
  customerKey: string;
  programs: LoyaltyMemberProgress[];
  onChanged: () => void;
}) {
  const [isOpen, setOpen] = useState(false);
  const [programId, setProgramId] = useState<string>(programs[0]?.programId ?? "");
  const [amount, setAmount] = useState("1");
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [note, setNote] = useState("");
  const [requestId, setRequestId] = useState("");
  const [isSaving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (programs.length === 0) return null;

  const open = () => {
    setProgramId(programs[0].programId);
    setAmount("1");
    setDirection("add");
    setNote("");
    setError(null);
    setMessage(null);
    // Once per intent — see the note above.
    setRequestId(newAdjustmentRequestId());
    setOpen(true);
  };

  const submit = async () => {
    if (!tenantId) return;
    const magnitude = Number(amount);
    if (!Number.isFinite(magnitude) || magnitude <= 0) {
      setError("Enter how many to add or take away.");
      return;
    }
    if (!note.trim()) {
      setError("Say why you are changing this balance.");
      return;
    }

    setSaving(true);
    setError(null);
    const result = await adjustMemberBalance(tenantId, {
      programId,
      customerKey,
      delta: direction === "add" ? magnitude : -magnitude,
      note: note.trim(),
      requestId,
    });
    setSaving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage(result.message);
    setOpen(false);
    onChanged();
  };

  const selected = programs.find((program) => program.programId === programId);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Fix a balance</Text>

      {message ? <Text style={styles.success}>{message}</Text> : null}

      {!isOpen ? (
        <>
          <Text style={styles.muted}>
            A missed stamp at the counter, or one given twice. Every change is recorded with
            your reason and shows in the card&apos;s history.
          </Text>
          <TouchableOpacity style={styles.ghost} onPress={open}>
            <Text style={styles.ghostLabel}>Adjust stamps</Text>
          </TouchableOpacity>
        </>
      ) : (
        <View style={styles.form}>
          {programs.length > 1 ? (
            <View style={styles.block}>
              <Text style={styles.label}>Card</Text>
              {programs.map((program) => (
                <TouchableOpacity
                  key={program.programId}
                  style={[styles.option, programId === program.programId && styles.optionActive]}
                  onPress={() => setProgramId(program.programId)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: programId === program.programId }}
                >
                  <Text
                    style={[
                      styles.optionLabel,
                      programId === program.programId && styles.optionLabelActive,
                    ]}
                  >
                    {program.programName}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          <View style={styles.choices}>
            {(
              [
                { value: "add" as const, label: "Add" },
                { value: "remove" as const, label: "Take away" },
              ]
            ).map((choice) => (
              <TouchableOpacity
                key={choice.value}
                style={[styles.choice, direction === choice.value && styles.choiceActive]}
                onPress={() => setDirection(choice.value)}
                accessibilityRole="radio"
                accessibilityState={{ selected: direction === choice.value }}
              >
                <Text
                  style={[
                    styles.choiceLabel,
                    direction === choice.value && styles.choiceLabelActive,
                  ]}
                >
                  {choice.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.block}>
            <Text style={styles.label}>
              How many {selected?.earnMode === "points" ? "points" : "stamps"}
            </Text>
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              keyboardType="number-pad"
              accessibilityLabel="Amount"
            />
          </View>

          <View style={styles.block}>
            <Text style={styles.label}>Reason</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              placeholder="e.g. Cashier forgot to stamp order 0412"
              placeholderTextColor={colors.textSecondary}
              value={note}
              onChangeText={setNote}
              multiline
              accessibilityLabel="Reason"
            />
          </View>

          {direction === "add" && selected && selected.remaining !== null && selected.remaining > 0 ? (
            <Text style={styles.muted}>
              {Number(amount) >= selected.remaining
                ? "This completes the card — the reward is issued straight away."
                : `They are ${selected.remaining} away from the next reward.`}
            </Text>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.button} disabled={isSaving} onPress={() => void submit()}>
              <Text style={styles.buttonLabel}>{isSaving ? "Saving…" : "Save change"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.ghost} onPress={() => setOpen(false)}>
              <Text style={styles.ghostLabel}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    padding: spacing.md,
    gap: spacing.sm,
  },
  title: { ...typography.heading, color: colors.textPrimary },
  muted: { ...typography.caption, color: colors.textSecondary },
  success: { ...typography.caption, color: colors.success, fontWeight: "700" },
  error: { ...typography.caption, color: colors.danger, fontWeight: "600" },
  form: { gap: spacing.sm },
  block: { gap: spacing.xs },
  label: { ...typography.small, color: colors.textSecondary, textTransform: "uppercase", fontWeight: "700" },
  option: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.card,
  },
  optionActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  optionLabel: { ...typography.caption, fontWeight: "600", color: colors.textPrimary },
  optionLabelActive: { color: colors.textOnDark, fontWeight: "700" },
  choices: { flexDirection: "row", gap: spacing.xs },
  choice: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.card,
    alignItems: "center",
  },
  choiceActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  choiceLabel: { ...typography.caption, fontWeight: "600", color: colors.textPrimary },
  choiceLabelActive: { color: colors.textOnDark, fontWeight: "700" },
  input: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.md,
    padding: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
  },
  multiline: { minHeight: 64, textAlignVertical: "top" },
  actions: { flexDirection: "row", gap: spacing.sm },
  button: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  buttonLabel: { ...typography.body, fontWeight: "700", color: colors.textOnDark },
  ghost: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.card,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
  },
  ghostLabel: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
});
