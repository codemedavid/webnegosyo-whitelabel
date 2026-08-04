import React, { useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { validateCollectAmount } from "../../lib/order-collect";

export interface CollectPaymentMethod {
  id: string;
  name: string;
}

export interface CollectedPayment {
  amount: number;
  methodId?: string;
  methodName?: string;
  reference?: string;
}

interface CollectPaymentSheetProps {
  visible: boolean;
  /** What the customer still owes. Also the ceiling and the default. */
  balanceDue: number;
  methods: readonly CollectPaymentMethod[];
  onSubmit: (payment: CollectedPayment) => Promise<void>;
  onClose: () => void;
}

/**
 * Settling a bill that was rung up earlier.
 *
 * Thin on purpose: whether an amount may be taken is
 * {@link validateCollectAmount}'s, which is unit tested. What lives here is the
 * wiring — pre-filling the balance so the common case is one tap, showing the
 * refusal instead of silently doing nothing, and refusing to fire twice while
 * the first payment is still in flight.
 */
export function CollectPaymentSheet({
  visible,
  balanceDue,
  methods,
  onSubmit,
  onClose,
}: CollectPaymentSheetProps) {
  // Pre-filled with the whole balance: settling in full is the overwhelmingly
  // common case, and retyping a figure already on screen is how a wrong one
  // gets typed.
  const [amount, setAmount] = useState(() => balanceDue.toFixed(2));
  const [methodId, setMethodId] = useState<string | null>(methods[0]?.id ?? null);
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  function close() {
    if (isRecording) return;
    onClose();
  }

  async function record() {
    if (isRecording) return;

    const verdict = validateCollectAmount(amount, balanceDue);
    if (!verdict.ok) {
      setError(verdict.error);
      return;
    }

    const method = methods.find((candidate) => candidate.id === methodId);
    const trimmedReference = reference.trim();

    setIsRecording(true);
    try {
      await onSubmit({
        amount: verdict.amount,
        ...(method ? { methodId: method.id, methodName: method.name } : {}),
        // Omitted rather than sent blank: an empty string renders as an empty
        // "Ref" line on the receipt and in the ledger.
        ...(trimmedReference === "" ? {} : { reference: trimmedReference }),
      });
    } finally {
      setIsRecording(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Collect payment</Text>
            <Text style={styles.owing}>₱{balanceDue.toFixed(2)} owing</Text>
          </View>

          <Text style={styles.label}>Amount to collect</Text>
          <TextInput
            accessibilityLabel="Amount to collect"
            style={styles.input}
            value={amount}
            keyboardType="decimal-pad"
            onChangeText={(next) => {
              setAmount(next);
              // Clearing on edit rather than on the next press: a stale refusal
              // beside a corrected figure reads as still refused.
              setError(null);
            }}
          />

          {methods.length > 0 && (
            <>
              <Text style={styles.label}>Paid with</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.methodRow}>
                  {methods.map((method) => {
                    const isActive = method.id === methodId;
                    return (
                      <TouchableOpacity
                        key={method.id}
                        style={[styles.methodChip, isActive && styles.methodChipActive]}
                        onPress={() => setMethodId(method.id)}
                        accessibilityRole="button"
                      >
                        <Text
                          style={[
                            styles.methodText,
                            isActive && styles.methodTextActive,
                          ]}
                        >
                          {method.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            </>
          )}

          <Text style={styles.label}>Reference number (optional)</Text>
          <TextInput
            accessibilityLabel="Reference number"
            style={styles.input}
            value={reference}
            onChangeText={setReference}
            placeholder="e.g. GCash ref"
            placeholderTextColor={colors.textSecondary}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[styles.submit, isRecording && styles.submitBusy]}
            onPress={record}
            disabled={isRecording}
            accessibilityRole="button"
          >
            <Text style={styles.submitText}>
              {isRecording ? "Recording..." : "Record payment"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={close} accessibilityRole="button">
            <Text style={styles.cancel}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  title: { ...typography.heading, color: colors.textPrimary },
  owing: { ...typography.body, fontWeight: "700", color: colors.danger },
  label: { ...typography.caption, color: colors.textSecondary },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  methodRow: { flexDirection: "row", gap: spacing.sm },
  methodChip: {
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  methodChipActive: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  methodText: { ...typography.small, color: colors.textPrimary },
  methodTextActive: { color: colors.textOnDark },
  error: { ...typography.small, color: colors.danger },
  submit: {
    backgroundColor: colors.textPrimary,
    borderRadius: radius.full,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  submitBusy: { opacity: 0.6 },
  submitText: { ...typography.heading, color: colors.textOnDark },
  cancel: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    paddingVertical: spacing.sm,
  },
});
