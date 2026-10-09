import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Modal } from "../Modal";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { centeredDialog, useCenteredDialog } from "./dialog-layout";
import { AddressField } from "./delivery/AddressField";
import { DeliveryFeeField } from "./delivery/DeliveryFeeField";
import {
  clearedSaleDelivery,
  parseDeliveryFee,
  type PosDeliveryDetails,
} from "../../lib/pos-delivery";
import { canSuggestDeliveryFee } from "../../lib/pos-delivery-quote";
import { EMPTY_CHECKOUT_SETUP, type LatLng } from "../../lib/pos-checkout-fields";
import { useDeliveryFeeSuggestion } from "../../lib/maps/use-delivery-fee-suggestion";
import { useCheckoutSetup } from "../../lib/query/use-checkout-setup";
import { useAuthStore } from "../../stores/auth-store";

interface DeliverySheetProps {
  visible: boolean;
  onClose: () => void;
  /** The sale's current details, shown as the draft when the sheet opens. */
  delivery: PosDeliveryDetails;
  onSave: (details: PosDeliveryDetails) => void;
  /**
   * Fee input only. Editing a PLACED order can revise its fee, but its address
   * and phone live on the order, not the register — showing dead inputs would
   * let a cashier "save" changes nothing persists.
   */
  feeOnly?: boolean;
  /** The sale's item subtotal, for the store's free-delivery minimum. */
  itemsSubtotal?: number;
}

/**
 * Delivery details for a counter sale — address, fee, contact, all optional.
 *
 * The address searches the same places as the storefront's address field;
 * picking one pins it (map preview + "Open in Google Maps") and, on a store
 * with distance pricing, fills in the fee it would charge online. The fee
 * stays the cashier's call: typing over it wins, and a typed fee is never
 * replaced by a later suggestion.
 */
export function DeliverySheet({
  visible,
  onClose,
  delivery,
  onSave,
  feeOnly = false,
  itemsSubtotal = 0,
}: DeliverySheetProps) {
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const setup = useCheckoutSetup(visible ? tenantId : null).data ?? EMPTY_CHECKOUT_SETUP;

  const [feeText, setFeeText] = useState("");
  // True while the fee box holds the suggestion rather than the cashier's own figure.
  const [isFeeSuggested, setIsFeeSuggested] = useState(false);
  const [address, setAddress] = useState("");
  const [location, setLocation] = useState<LatLng | null>(null);
  const [phone, setPhone] = useState("");
  const [feeError, setFeeError] = useState<string | null>(null);

  // Re-drafted from the sale each time the sheet opens, so reopening shows
  // what the sale actually holds rather than an abandoned earlier draft.
  useEffect(() => {
    if (!visible) return;
    setFeeText(delivery.fee !== null ? String(delivery.fee) : "");
    setIsFeeSuggested(false);
    setAddress(delivery.address);
    setLocation(delivery.location ?? null);
    setPhone(delivery.phone);
    setFeeError(null);
  }, [visible, delivery]);

  const { suggestion, isCalculating } = useDeliveryFeeSuggestion(
    feeOnly ? null : tenantId,
    setup.delivery,
    location,
    itemsSubtotal,
  );

  // A new suggestion fills an EMPTY fee box, or replaces an earlier
  // suggestion — never a figure the cashier typed.
  useEffect(() => {
    if (!suggestion) return;
    if (feeText.trim() !== "" && !isFeeSuggested) return;
    setFeeText(suggestion.fee > 0 ? String(suggestion.fee) : "");
    setIsFeeSuggested(true);
    setFeeError(null);
    // Only a new suggestion should refill the box.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestion]);

  function handleFeeChange(next: string) {
    setFeeText(next);
    setIsFeeSuggested(false);
    setFeeError(null);
  }

  function handleUseSuggestion() {
    if (!suggestion) return;
    setFeeText(suggestion.fee > 0 ? String(suggestion.fee) : "");
    setIsFeeSuggested(true);
    setFeeError(null);
  }

  function save() {
    const fee = parseDeliveryFee(feeText);
    // A typed amount that parses to nothing is a mistake to correct, not a
    // fee to silently drop — the cashier believes they charged it.
    if (feeText.trim() !== "" && fee === null) {
      setFeeError("Enter the fee as a plain amount, e.g. 50");
      return;
    }

    const trimmedAddress = address.trim();
    onSave({
      fee,
      address: trimmedAddress,
      phone: phone.trim(),
      location: trimmedAddress ? location : null,
    });
    onClose();
  }

  function removeDelivery() {
    onSave(clearedSaleDelivery().delivery);
    onClose();
  }

  const hasExisting =
    delivery.fee !== null || delivery.address !== "" || delivery.phone !== "";
  const canHintPin = canSuggestDeliveryFee(setup.delivery);

  // A docked sheet becomes a centred dialog once the glass is a tablet's
  // (components/pos/dialog-layout.ts).
  const isCentered = useCenteredDialog();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.backdrop, isCentered && centeredDialog.backdrop]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <TouchableOpacity
          style={styles.backdropFill}
          onPress={onClose}
          activeOpacity={1}
          accessibilityLabel="Dismiss delivery details"
        />

        <View style={[styles.sheet, isCentered && centeredDialog.sheet]}>
          <View style={styles.grabber} />
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>{feeOnly ? "Delivery fee" : "Delivery details"}</Text>
              {!feeOnly && <Text style={styles.subtitle}>Everything here is optional</Text>}
            </View>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.close}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {!feeOnly && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Address</Text>
                <AddressField
                  key={visible ? "open" : "closed"}
                  tenantId={tenantId}
                  address={address}
                  location={location}
                  near={setup.delivery.store}
                  onChange={(next) => {
                    setAddress(next.address);
                    setLocation(next.location);
                  }}
                />
              </View>
            )}

            <View style={styles.section}>
              {/* The title already says it when the fee is all there is. */}
              {!feeOnly && <Text style={styles.sectionLabel}>Delivery fee</Text>}
              <DeliveryFeeField
                value={feeText}
                onChange={handleFeeChange}
                error={feeError}
                suggestion={suggestion}
                isCalculating={isCalculating}
                isSuggested={isFeeSuggested}
                onUseSuggestion={handleUseSuggestion}
                showPinHint={canHintPin && !feeOnly && location === null && address.trim() !== ""}
              />
            </View>

            {!feeOnly && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Contact number</Text>
                <TextInput
                  style={styles.input}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="e.g. 0917 000 1234"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="phone-pad"
                  textContentType="telephoneNumber"
                  accessibilityLabel="Contact number"
                />
              </View>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.save} onPress={save} accessibilityRole="button">
              <Text style={styles.saveText}>Save</Text>
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
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  backdropFill: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    maxHeight: "92%",
  },
  grabber: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.separator,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingBottom: spacing.sm,
  },
  headerText: { flex: 1 },
  title: { ...typography.heading, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  close: { ...typography.caption, color: colors.textSecondary, fontWeight: "700", paddingTop: 2 },
  scrollContent: { paddingBottom: spacing.md },
  section: { marginTop: spacing.lg },
  sectionLabel: {
    ...typography.small,
    color: colors.textSecondary,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: spacing.sm,
  },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  footer: {
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  save: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    alignItems: "center",
    paddingVertical: spacing.md + 2,
  },
  saveText: { ...typography.body, fontWeight: "700", color: colors.textOnDark },
  remove: { alignItems: "center", paddingVertical: spacing.md },
  removeText: { ...typography.caption, color: colors.danger, fontWeight: "600" },
});
