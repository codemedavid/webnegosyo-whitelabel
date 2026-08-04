import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { validateManualDiscount, type ManualDiscount } from "../../lib/pos-discount";
import { buildVoucherChoices } from "../../lib/pos-voucher-picker";
import { hasPermission, type StaffPermissionHolder } from "../../lib/staff-permissions";
import { listVouchers, lookupVouchers } from "../../lib/voucher-service";
import { VoucherChoiceRow } from "./VoucherChoiceRow";
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
  /** Codes already on this sale — from the session, not the priced lines. */
  appliedCodes?: readonly string[];
  hasManualDiscount?: boolean;
  onRemoveVoucher?: (code: string) => void;
  onRemoveManual?: () => void;
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
  appliedCodes = [],
  hasManualDiscount = false,
  onRemoveVoucher,
  onRemoveManual,
}: DiscountSheetProps) {
  const [code, setCode] = useState("");
  const [isLooking, setIsLooking] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [offers, setOffers] = useState<readonly Voucher[]>([]);
  const [isBrowsing, setIsBrowsing] = useState(false);

  const [kind, setKind] = useState<ManualDiscount["kind"]>("fixed");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);

  const canDiscountManually = hasPermission(user, "vouchers");

  // Fetched when the sheet opens, not once at mount: the owner edits
  // promotions in the web admin while the shop is trading, and a list read at
  // app launch would offer a code that ended hours ago.
  useEffect(() => {
    if (!visible || !tenantId) return;
    let isCurrent = true;

    setIsBrowsing(true);
    listVouchers(tenantId)
      .then((found) => {
        if (isCurrent) setOffers(found);
      })
      .finally(() => {
        if (isCurrent) setIsBrowsing(false);
      });

    // A sheet closed and reopened mid-flight must not have the older fetch
    // land on top of the newer one.
    return () => {
      isCurrent = false;
    };
  }, [visible, tenantId]);

  // Judged fresh on every render rather than memoised. The verdict depends on
  // the cart, and a memo keyed on the voucher list alone would keep offering a
  // code that stopped qualifying when a line was voided.
  const choices = buildVoucherChoices(offers, appliedCodes, onCheckVoucher);

  function chooseVoucher(voucher: Voucher) {
    // Judged again on the tap, not trusted from the render that drew the row:
    // the incoming-orders panel can re-price the sale underneath an open
    // sheet, and this is the verdict the money is taken on.
    const verdict = onCheckVoucher(voucher);
    if (!verdict.isAccepted) return;
    onApplyVoucher(voucher);
  }

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

          {isBrowsing && offers.length === 0 && (
            <ActivityIndicator style={styles.browsing} color={colors.primary} />
          )}

          {choices.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, styles.offersLabel]}>Available vouchers</Text>
              {/* Bounded height: a merchant running twenty promotions must not
                  push the manual-discount section off the bottom of a phone. */}
              <ScrollView style={styles.offers} contentContainerStyle={styles.offersContent}>
                {choices.map((choice) => (
                  <VoucherChoiceRow
                    key={choice.voucher.id}
                    choice={choice}
                    onApply={() => chooseVoucher(choice.voucher)}
                    onRemove={() => onRemoveVoucher?.(choice.voucher.code)}
                  />
                ))}
              </ScrollView>
            </>
          )}

          {hasManualDiscount && onRemoveManual && (
            // A manual discount has no code to find in the list above, so it
            // needs its own way back off. Without one the only route was to
            // clear the whole sale and ring it again.
            <TouchableOpacity
              style={styles.removeManual}
              onPress={onRemoveManual}
              accessibilityRole="button"
              accessibilityLabel="Remove manual discount"
            >
              <Text style={styles.removeManualText}>Remove manual discount</Text>
            </TouchableOpacity>
          )}

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
  browsing: { paddingVertical: spacing.md },
  offersLabel: { marginTop: spacing.md },
  offers: { maxHeight: 260 },
  offersContent: { gap: spacing.sm, paddingBottom: spacing.xs },
  removeManual: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  removeManualText: { ...typography.body, fontWeight: "700", color: colors.danger },
  kindText: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  error: { ...typography.caption, color: colors.danger },
});
