import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { validateManualDiscount, type ManualDiscount } from "../../lib/pos-discount";
import { hasPermission, type StaffPermissionHolder } from "../../lib/staff-permissions";
import { lookupVouchers } from "../../lib/voucher-service";
import type { VoucherEntryVerdict } from "../../lib/pos-voucher-entry";
import type { Voucher } from "../../lib/vouchers/types";

interface DiscountSheetProps {
  visible: boolean;
  onClose: () => void;
  tenantId: string | null;
  user: StaffPermissionHolder;
  /** Judges a found code against the sale before it is accepted. */
  onCheckVoucher: (voucher: Voucher) => VoucherEntryVerdict;
  onApplyVoucher: (voucher: Voucher) => void;
  onApplyManual: (manual: ManualDiscount) => void;
}

/**
 * Taking money off a counter sale.
 *
 * Two routes, deliberately separated because they carry different risk.
 *
 * A VOUCHER is a rule the merchant wrote in advance: the cashier types a code
 * and the shared engine decides what it is worth. Any cashier may do this —
 * honouring a code the shop advertises is ordinary counter work.
 *
 * A MANUAL discount is the cashier deciding, at the counter, to take money off.
 * There is no rule to evaluate, which makes it a till-skimming vector, so it
 * needs the `vouchers` permission and a written reason. The section is hidden
 * without the permission AND refused by `validateManualDiscount` — a hidden
 * button is not a control.
 */
export function DiscountSheet({
  visible,
  onClose,
  tenantId,
  user,
  onCheckVoucher,
  onApplyVoucher,
  onApplyManual,
}: DiscountSheetProps) {
  const [code, setCode] = useState("");
  const [isLooking, setIsLooking] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  const [kind, setKind] = useState<ManualDiscount["kind"]>("fixed");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);

  const canDiscountManually = hasPermission(user, "vouchers");

  function reset() {
    setCode("");
    setCodeError(null);
    setAmount("");
    setReason("");
    setManualError(null);
    setIsLooking(false);
  }

  function close() {
    reset();
    onClose();
  }

  async function applyCode() {
    const entered = code.trim();
    if (entered === "" || !tenantId) return;

    setIsLooking(true);
    setCodeError(null);

    // Cleared in `finally`, never on the line after the await. The spinner also
    // disables Apply, so a lookup that rejects would otherwise leave the
    // register stuck on a code with no way back except killing the app.
    let vouchers: Voucher[];
    try {
      vouchers = await lookupVouchers(tenantId, [entered]);
    } catch {
      vouchers = [];
    } finally {
      setIsLooking(false);
    }

    // Fails closed: a code that could not be verified — unknown, or simply no
    // signal at the counter — is worth nothing rather than assumed valid.
    if (vouchers.length === 0) {
      setCodeError("That code could not be applied. Check it and try again.");
      return;
    }

    // Existing is not the same as usable. A fully claimed, expired or
    // wrong-branch code would otherwise be accepted here and then render no
    // discount row, leaving the cashier watching the sheet close with nothing
    // changed and no reason to give the customer.
    const verdict = onCheckVoucher(vouchers[0]);
    if (!verdict.isAccepted) {
      setCodeError(verdict.message ?? "That code cannot be used on this sale.");
      return;
    }

    onApplyVoucher(vouchers[0]);
    close();
  }

  function applyManual() {
    const discount: ManualDiscount = {
      kind,
      value: Number(amount),
      reason: reason.trim(),
    };

    const verdict = validateManualDiscount(discount, user);
    if (!verdict.isAllowed) {
      setManualError(verdict.message ?? "That discount cannot be given.");
      return;
    }

    onApplyManual(discount);
    close();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Add discount</Text>
            <TouchableOpacity onPress={close} accessibilityRole="button">
              <Text style={styles.close}>Done</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionLabel}>Voucher code</Text>
          <View style={styles.row}>
            <TextInput
              style={styles.input}
              value={code}
              onChangeText={(next) => {
                setCode(next);
                setCodeError(null);
              }}
              placeholder="e.g. WELCOME10"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!isLooking}
              accessibilityLabel="Voucher code"
            />
            <TouchableOpacity
              style={[styles.apply, (isLooking || code.trim() === "") && styles.applyDisabled]}
              onPress={applyCode}
              disabled={isLooking || code.trim() === ""}
              accessibilityRole="button"
            >
              {isLooking ? (
                <ActivityIndicator color={colors.card} />
              ) : (
                <Text style={styles.applyText}>Apply</Text>
              )}
            </TouchableOpacity>
          </View>
          {codeError && <Text style={styles.error}>{codeError}</Text>}

          {canDiscountManually && (
            <>
              <Text style={[styles.sectionLabel, styles.manualLabel]}>Manual discount</Text>

              <View style={styles.row}>
                <TouchableOpacity
                  style={[styles.kindChip, kind === "fixed" && styles.kindChipActive]}
                  onPress={() => setKind("fixed")}
                  accessibilityRole="button"
                  accessibilityState={{ selected: kind === "fixed" }}
                >
                  <Text style={styles.kindText}>₱</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.kindChip, kind === "percent" && styles.kindChipActive]}
                  onPress={() => setKind("percent")}
                  accessibilityRole="button"
                  accessibilityState={{ selected: kind === "percent" }}
                >
                  <Text style={styles.kindText}>%</Text>
                </TouchableOpacity>
                <TextInput
                  style={[styles.input, styles.amountInput]}
                  value={amount}
                  onChangeText={(next) => {
                    setAmount(next);
                    setManualError(null);
                  }}
                  placeholder="0"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="decimal-pad"
                  accessibilityLabel="Discount amount"
                />
              </View>

              <TextInput
                style={[styles.input, styles.reasonInput]}
                value={reason}
                onChangeText={(next) => {
                  setReason(next);
                  setManualError(null);
                }}
                placeholder="Reason (required)"
                placeholderTextColor={colors.textSecondary}
                accessibilityLabel="Reason for discount"
              />

              {manualError && <Text style={styles.error}>{manualError}</Text>}

              <TouchableOpacity
                style={styles.manualApply}
                onPress={applyManual}
                accessibilityRole="button"
              >
                <Text style={styles.applyText}>Apply discount</Text>
              </TouchableOpacity>
            </>
          )}
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
  close: { ...typography.body, fontWeight: "600", color: colors.primary },
  sectionLabel: { ...typography.caption, color: colors.textSecondary },
  manualLabel: { marginTop: spacing.lg },
  row: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  amountInput: { flex: 1 },
  reasonInput: { flex: 0 },
  apply: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    minWidth: 88,
    alignItems: "center",
  },
  applyDisabled: { opacity: 0.4 },
  applyText: { ...typography.body, fontWeight: "700", color: colors.card },
  manualApply: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: "center",
    marginTop: spacing.xs,
  },
  kindChip: {
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  kindChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  kindText: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  error: { ...typography.caption, color: colors.danger },
});
