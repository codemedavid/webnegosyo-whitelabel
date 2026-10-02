import React, { useEffect, useState } from "react";
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
import {
  defaultCollectMethodId,
  validateCashCollect,
  validateCollectAmount,
} from "../../lib/order-collect";
import { computeChange, quickTenderSuggestions } from "../../lib/pos-cash";
import { formatPeso } from "../../lib/format";

export interface CollectPaymentMethod {
  id: string;
  name: string;
  /** Settled with notes at the drawer: opens the cash-received pad. */
  isCash?: boolean;
}

export interface CollectedPayment {
  amount: number;
  methodId?: string;
  methodName?: string;
  reference?: string;
  /** Cash only: what the customer handed over. */
  cashTendered?: number;
  /** Cash only: what was handed back. */
  changeDue?: number;
}

interface CollectPaymentSheetProps {
  visible: boolean;
  /** What the customer still owes. Also the ceiling and the default. */
  balanceDue: number;
  methods: readonly CollectPaymentMethod[];
  onSubmit: (payment: CollectedPayment) => Promise<void>;
  onClose: () => void;
  /** The method the customer chose at checkout, pre-selected when offered. */
  preferredMethodName?: string | null;
  /** A reference the customer already gave (e.g. their GCash ref). */
  initialReference?: string | null;
  /** Defaults to "Collect payment". */
  title?: string;
  /** Defaults to "Record payment". */
  submitLabel?: string;
}

/**
 * Settling a bill that was rung up earlier — a "pay later" counter sale, a
 * delivery paid on arrival, a web order paid at pickup.
 *
 * Cash works the way the register's tender screen does: type (or tap) what the
 * customer handed over and the change is worked out on the spot. The ledger
 * records the amount collected, never the cash — the change went back.
 *
 * Thin on purpose: whether an amount may be taken is `lib/order-collect.ts`'s,
 * which is unit tested. What lives here is the wiring — pre-filling the
 * balance so the common case is one tap, showing the refusal instead of
 * silently doing nothing, and refusing to fire twice while the first payment
 * is still in flight.
 */
export function CollectPaymentSheet({
  visible,
  balanceDue,
  methods,
  onSubmit,
  onClose,
  preferredMethodName,
  initialReference,
  title = "Collect payment",
  submitLabel = "Record payment",
}: CollectPaymentSheetProps) {
  // Pre-filled with the whole balance: settling in full is the overwhelmingly
  // common case, and retyping a figure already on screen is how a wrong one
  // gets typed.
  const [amount, setAmount] = useState(() => balanceDue.toFixed(2));
  const [cash, setCash] = useState("");
  const [isEditingAmount, setIsEditingAmount] = useState(false);
  const [methodId, setMethodId] = useState<string | null>(() =>
    defaultCollectMethodId(methods, preferredMethodName),
  );
  const [reference, setReference] = useState(initialReference ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  // The sheet stays mounted between visits, so every opening starts from the
  // bill as it stands NOW — a part payment since the last visit has moved the
  // balance, and a stale pre-fill would over-collect.
  useEffect(() => {
    if (!visible) return;
    setAmount(balanceDue.toFixed(2));
    setCash("");
    setIsEditingAmount(false);
    setMethodId(defaultCollectMethodId(methods, preferredMethodName));
    setReference(initialReference ?? "");
    setError(null);
    // Re-seeded on opening only: a list refresh while the sheet is open must
    // not wipe what the cashier is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const method = methods.find((candidate) => candidate.id === methodId) ?? null;
  const isCash = method?.isCash === true;

  const amountNumber = Number(amount);
  const collectingNow = Number.isFinite(amountNumber) && amountNumber > 0 ? amountNumber : 0;
  const cashNumber = cash.trim() === "" ? -1 : Number(cash);
  const change = computeChange(collectingNow, Number.isFinite(cashNumber) ? cashNumber : -1);
  const suggestions = quickTenderSuggestions(collectingNow);
  const isPartial = collectingNow > 0 && collectingNow < balanceDue - 0.005;

  function close() {
    if (isRecording) return;
    onClose();
  }

  function clearError() {
    // Clearing on edit rather than on the next press: a stale refusal beside a
    // corrected figure reads as still refused.
    setError(null);
  }

  async function record() {
    if (isRecording) return;

    const cashVerdict = isCash
      ? validateCashCollect({ amountRaw: amount, cashRaw: cash, balanceDue })
      : null;
    const verdict = cashVerdict ?? validateCollectAmount(amount, balanceDue);
    if (!verdict.ok) {
      setError(verdict.error);
      return;
    }

    const trimmedReference = reference.trim();

    setIsRecording(true);
    try {
      await onSubmit({
        amount: verdict.amount,
        ...(method ? { methodId: method.id, methodName: method.name } : {}),
        ...(cashVerdict?.ok
          ? { cashTendered: cashVerdict.cashTendered, changeDue: cashVerdict.changeDue }
          : {}),
        // Omitted rather than sent blank: an empty string renders as an empty
        // "Ref" line on the receipt and in the ledger. Cash carries none.
        ...(isCash || trimmedReference === "" ? {} : { reference: trimmedReference }),
      });
    } finally {
      setIsRecording(false);
    }
  }

  const amountInput = (
    <>
      <Text style={styles.label}>Amount to collect</Text>
      <TextInput
        accessibilityLabel="Amount to collect"
        style={styles.input}
        value={amount}
        keyboardType="decimal-pad"
        onChangeText={(next) => {
          setAmount(next);
          clearError();
        }}
      />
    </>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.title}>{title}</Text>

            <View style={styles.owingRow}>
              <Text style={styles.owingLabel}>Balance due</Text>
              <Text style={styles.owing}>{formatPeso(balanceDue)}</Text>
            </View>

            {methods.length > 0 && (
              <>
                <Text style={styles.label}>Paid with</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  <View style={styles.methodRow}>
                    {methods.map((candidate) => {
                      const isActive = candidate.id === methodId;
                      return (
                        <TouchableOpacity
                          key={candidate.id}
                          style={[styles.methodChip, isActive && styles.methodChipActive]}
                          onPress={() => {
                            setMethodId(candidate.id);
                            clearError();
                          }}
                          accessibilityRole="button"
                          accessibilityState={{ selected: isActive }}
                        >
                          <Text style={[styles.methodText, isActive && styles.methodTextActive]}>
                            {candidate.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              </>
            )}

            {isCash ? (
              <>
                <Text style={styles.label}>Cash received</Text>
                <TextInput
                  accessibilityLabel="Cash received"
                  style={styles.cashInput}
                  value={cash}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={colors.textTertiary}
                  onChangeText={(next) => {
                    setCash(next);
                    clearError();
                  }}
                />
                <View style={styles.suggestions}>
                  {suggestions.map((suggestion, index) => (
                    <TouchableOpacity
                      key={suggestion}
                      style={styles.suggestion}
                      onPress={() => {
                        setCash(suggestion.toFixed(2));
                        clearError();
                      }}
                      accessibilityRole="button"
                    >
                      <Text style={styles.suggestionText}>
                        {index === 0 ? `Exact ${formatPeso(suggestion)}` : formatPeso(suggestion)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View
                  style={[styles.changeBox, change.isSufficient && styles.changeBoxReady]}
                  accessibilityLabel={`Change ${formatPeso(change.changeDue)}`}
                >
                  <Text style={styles.changeLabel}>Change</Text>
                  <Text style={styles.changeAmount}>{formatPeso(change.changeDue)}</Text>
                </View>

                {isEditingAmount ? (
                  amountInput
                ) : (
                  <View style={styles.collectingRow}>
                    <Text style={styles.collectingText}>
                      Collecting {formatPeso(collectingNow)}
                      {isPartial ? " (part of the bill)" : " — the full balance"}
                    </Text>
                    <TouchableOpacity
                      onPress={() => setIsEditingAmount(true)}
                      accessibilityRole="button"
                    >
                      <Text style={styles.linkText}>Collect less</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            ) : (
              <>
                {amountInput}
                <Text style={styles.label}>Reference number (optional)</Text>
                <TextInput
                  accessibilityLabel="Reference number"
                  style={styles.input}
                  value={reference}
                  onChangeText={setReference}
                  autoCapitalize="characters"
                  placeholder="e.g. GCash ref"
                  placeholderTextColor={colors.textSecondary}
                />
              </>
            )}

            {isPartial && (
              <Text style={styles.partialNote}>
                {formatPeso(balanceDue - collectingNow)} will still be owed after this.
              </Text>
            )}

            {error && (
              <Text style={styles.error} accessibilityRole="alert">
                {error}
              </Text>
            )}

            <TouchableOpacity
              style={[styles.submit, isRecording && styles.submitBusy]}
              onPress={record}
              disabled={isRecording}
              accessibilityRole="button"
            >
              <Text style={styles.submitText}>{isRecording ? "Recording..." : submitLabel}</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={close} accessibilityRole="button">
              <Text style={styles.cancel}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
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
    maxHeight: "92%",
  },
  content: { padding: spacing.lg, gap: spacing.sm },
  title: { ...typography.heading, color: colors.textPrimary },
  owingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
    marginBottom: spacing.xs,
  },
  owingLabel: { ...typography.body, color: colors.textSecondary },
  owing: { fontSize: 28, fontWeight: "800", color: colors.textPrimary },
  label: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  cashInput: {
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 28,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  suggestions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  suggestion: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  suggestionText: { ...typography.caption, color: colors.textPrimary, fontWeight: "600" },
  changeBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginTop: spacing.xs,
  },
  changeBoxReady: { backgroundColor: colors.successLight },
  changeLabel: { ...typography.eyebrow, color: colors.textSecondary },
  changeAmount: { fontSize: 28, fontWeight: "800", color: colors.textPrimary },
  collectingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
  },
  collectingText: { ...typography.caption, color: colors.textSecondary, flexShrink: 1 },
  linkText: { ...typography.caption, color: colors.accent, fontWeight: "700" },
  partialNote: { ...typography.caption, color: colors.warning, fontWeight: "600" },
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
