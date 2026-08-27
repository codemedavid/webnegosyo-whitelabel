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
  clearedSaleDelivery,
  parseDeliveryFee,
  type PosDeliveryDetails,
} from "../../lib/pos-delivery";

interface DeliverySheetProps {
  visible: boolean;
  onClose: () => void;
  /** The sale's current details, shown as the draft when the sheet opens. */
  delivery: PosDeliveryDetails;
  onSave: (details: PosDeliveryDetails) => void;
}

/**
 * Delivery details for a counter sale — fee, address, phone, all optional.
 *
 * One sheet for all three rather than a fee prompt plus fields on the tender
 * screen: the cashier taking a phoned-in delivery writes everything down in
 * one motion, and a fee with no address is as common as the reverse (a rider
 * who already knows the block). Nothing here validates beyond the fee being a
 * positive number, because every field is optional by design.
 */
export function DeliverySheet({ visible, onClose, delivery, onSave }: DeliverySheetProps) {
  const [feeText, setFeeText] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [feeError, setFeeError] = useState<string | null>(null);

  // Re-drafted from the sale each time the sheet opens, so reopening shows
  // what the sale actually holds rather than an abandoned earlier draft.
  useEffect(() => {
    if (!visible) return;
    setFeeText(delivery.fee !== null ? String(delivery.fee) : "");
    setAddress(delivery.address);
    setPhone(delivery.phone);
    setFeeError(null);
  }, [visible, delivery]);

  function save() {
    const fee = parseDeliveryFee(feeText);
    // A typed amount that parses to nothing is a mistake to correct, not a
    // fee to silently drop — the cashier believes they charged it.
    if (feeText.trim() !== "" && fee === null) {
      setFeeError("Enter the fee as a plain amount, e.g. 50");
      return;
    }

    onSave({ fee, address: address.trim(), phone: phone.trim() });
    onClose();
  }

  function removeDelivery() {
    onSave(clearedSaleDelivery().delivery);
    onClose();
  }

  const hasExisting =
    delivery.fee !== null || delivery.address !== "" || delivery.phone !== "";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Delivery details</Text>
            <TouchableOpacity onPress={onClose} accessibilityRole="button">
              <Text style={styles.close}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionLabel}>Delivery fee (optional)</Text>
            <TextInput
              style={styles.input}
              value={feeText}
              onChangeText={(next) => {
                setFeeText(next);
                setFeeError(null);
              }}
              placeholder="e.g. 50"
              placeholderTextColor={colors.textSecondary}
              keyboardType="decimal-pad"
              accessibilityLabel="Delivery fee"
            />
            {feeError && <Text style={styles.error}>{feeError}</Text>}

            <Text style={styles.sectionLabel}>Delivery address (optional)</Text>
            <TextInput
              style={[styles.input, styles.addressInput]}
              value={address}
              onChangeText={setAddress}
              placeholder="Street, barangay, landmark…"
              placeholderTextColor={colors.textSecondary}
              multiline
              accessibilityLabel="Delivery address"
            />

            <Text style={styles.sectionLabel}>Contact number (optional)</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="e.g. 0917 000 1234"
              placeholderTextColor={colors.textSecondary}
              keyboardType="phone-pad"
              accessibilityLabel="Contact number"
            />

            <TouchableOpacity style={styles.save} onPress={save} accessibilityRole="button">
              <Text style={styles.saveText}>Save delivery details</Text>
            </TouchableOpacity>

            {hasExisting && (
              <TouchableOpacity
                style={styles.remove}
                onPress={removeDelivery}
                accessibilityRole="button"
              >
                <Text style={styles.removeText}>Remove delivery from this sale</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    maxHeight: "85%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: spacing.md,
  },
  title: { ...typography.heading, color: colors.textPrimary },
  close: { ...typography.caption, color: colors.textSecondary, fontWeight: "700" },
  sectionLabel: {
    ...typography.small,
    color: colors.textSecondary,
    fontWeight: "700",
    textTransform: "uppercase",
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  addressInput: { minHeight: 64, textAlignVertical: "top" },
  error: { ...typography.small, color: colors.danger, marginTop: spacing.xs },
  save: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    alignItems: "center",
    paddingVertical: spacing.md,
    marginTop: spacing.xl,
  },
  saveText: { ...typography.body, fontWeight: "700", color: colors.textOnDark },
  remove: { alignItems: "center", paddingVertical: spacing.md },
  removeText: { ...typography.caption, color: colors.danger, fontWeight: "600" },
});
