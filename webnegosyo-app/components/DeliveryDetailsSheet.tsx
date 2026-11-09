import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Modal } from "./Modal";
import { AddressField } from "./pos/delivery/AddressField";
import { colors, radius, spacing, typography } from "../theme/colors";
import { saveDeliveryDetails } from "../lib/delivery-details-service";
import { findDeliveryDetails, DELIVERY_STORE_NOTE_KEY } from "../lib/delivery-details";
import { EMPTY_CHECKOUT_SETUP, type LatLng } from "../lib/pos-checkout-fields";
import { useCheckoutSetup } from "../lib/query/use-checkout-setup";

const DETAIL_MAX_LENGTH = 200;
const STORE_NOTE_MAX_LENGTH = 300;

interface DeliveryDetailsSheetProps {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  tenantId: string | null;
  orderId: string;
  address: string;
  location: LatLng | null;
  customerData: Record<string, unknown> | null | undefined;
}

interface DetailInputProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  maxLength: number;
  isMultiline?: boolean;
}

function DetailInput({ label, value, onChange, placeholder, maxLength, isMultiline = false }: DetailInputProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, isMultiline && styles.multiline]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        maxLength={maxLength}
        multiline={isMultiline}
        accessibilityLabel={label}
      />
    </View>
  );
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Fix a placed order's address, pin and notes, on the phone with the customer.
 * Picking a search result sets the pin; a typed address keeps the words and
 * leaves the pin alone, and "Send pin link" on the order covers the rest.
 */
export function DeliveryDetailsSheet({ visible, onClose, onSaved, tenantId, orderId, address, location, customerData }: DeliveryDetailsSheetProps) {
  const setup = useCheckoutSetup(visible ? tenantId : null).data ?? EMPTY_CHECKOUT_SETUP;
  const [draftAddress, setDraftAddress] = useState(address);
  const [draftLocation, setDraftLocation] = useState<LatLng | null>(location);
  const [unit, setUnit] = useState("");
  const [landmark, setLandmark] = useState("");
  const [riderNote, setRiderNote] = useState("");
  const [storeNote, setStoreNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Drafted from the order each time it opens, so an abandoned edit never comes back.
  useEffect(() => {
    if (!visible) return;
    const details = findDeliveryDetails(customerData);
    setDraftAddress(address);
    setDraftLocation(location);
    setUnit(details.unit);
    setLandmark(details.landmark);
    setRiderNote(details.riderNote);
    setStoreNote(text(customerData?.[DELIVERY_STORE_NOTE_KEY]));
    setError(null);
    // Only opening re-drafts: the order refreshing behind the sheet must not wipe what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  async function save() {
    if (!tenantId) return;
    setIsSaving(true);
    setError(null);
    const trimmedAddress = draftAddress.trim();
    const result = await saveDeliveryDetails(tenantId, orderId, {
      ...(trimmedAddress ? { address: trimmedAddress } : {}),
      ...(draftLocation ? { pin: draftLocation } : {}),
      unit: unit.trim(),
      landmark: landmark.trim(),
      riderNote: riderNote.trim(),
      storeNote: storeNote.trim(),
    });
    setIsSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <TouchableOpacity style={styles.backdropFill} onPress={onClose} activeOpacity={1} accessibilityLabel="Dismiss delivery details" />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Delivery details</Text>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.close}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.section}>
              <Text style={styles.label}>Address</Text>
              <AddressField
                key={visible ? "open" : "closed"}
                tenantId={tenantId}
                address={draftAddress}
                location={draftLocation}
                near={setup.delivery.store}
                onChange={(next) => {
                  setDraftAddress(next.address);
                  setDraftLocation(next.location);
                }}
              />
            </View>
            <DetailInput label="House / Blk / Lot / Unit" value={unit} onChange={setUnit} placeholder="e.g. Blk 4 Lot 12, or Unit 5B" maxLength={DETAIL_MAX_LENGTH} />
            <DetailInput label="Landmark" value={landmark} onChange={setLandmark} placeholder="e.g. Blue gate beside 7-Eleven" maxLength={DETAIL_MAX_LENGTH} />
            <DetailInput label="Customer's note to rider" value={riderNote} onChange={setRiderNote} placeholder="e.g. Call me when you arrive" maxLength={DETAIL_MAX_LENGTH} />
            <DetailInput label="Store note to rider" value={storeNote} onChange={setStoreNote} placeholder="e.g. Fragile, keep upright" maxLength={STORE_NOTE_MAX_LENGTH} isMultiline />
          </ScrollView>

          <View style={styles.footer}>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <TouchableOpacity style={styles.save} onPress={() => void save()} disabled={isSaving} accessibilityRole="button">
              {isSaving ? <ActivityIndicator color={colors.card} /> : <Text style={styles.saveText}>Save</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  backdropFill: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: "92%",
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg },
  title: { ...typography.heading, color: colors.textPrimary },
  close: { ...typography.body, color: colors.textSecondary },
  scrollContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  section: { marginBottom: spacing.md },
  label: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.xs },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
  multiline: { minHeight: 72, textAlignVertical: "top" },
  footer: { padding: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
  error: { ...typography.caption, color: colors.danger, marginBottom: spacing.sm },
  save: { backgroundColor: colors.accent, borderRadius: radius.md, minHeight: 48, alignItems: "center", justifyContent: "center" },
  saveText: { ...typography.heading, color: colors.card },
});
