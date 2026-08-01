import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  Image,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useAuthStore } from "../../../stores/auth-store";
import { DEMO_READONLY_MESSAGE } from "../../../lib/demo";
import {
  buildEditorFormState,
  createPaymentMethod,
  deletePaymentMethod,
  getPaymentMethod,
  updatePaymentMethod,
  validatePaymentMethodInput,
  EMPTY_PAYMENT_METHOD_INPUT,
  type PaymentMethodInput,
} from "../../../lib/payment-methods";
import { listOrderTypes, type PosOrderType } from "../../../lib/pos-catalog";
import { uploadPaymentQr } from "../../../lib/product-image-upload";
import { pickQrImage } from "../../../lib/image-picker";
import { NEW_PAYMENT_METHOD_ID, paymentMethodHref } from "../../../lib/navigation";
import { goTo } from "../../../lib/tab-navigation";
import { colors, typography, spacing, radius, shadow } from "../../../theme/colors";
import { Card } from "../../../components/Card";
import { LoadingState } from "../../../components/LoadingState";

export default function PaymentMethodEditorScreen() {
  const { methodId } = useLocalSearchParams<{ methodId: string }>();
  const isNew = methodId === NEW_PAYMENT_METHOD_ID;
  const tenantId = useAuthStore((s) => s.tenantId);

  const [orderTypes, setOrderTypes] = useState<PosOrderType[]>([]);
  const [form, setForm] = useState<PaymentMethodInput>(EMPTY_PAYMENT_METHOD_INPUT);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingQr, setIsUploadingQr] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      try {
        setOrderTypes(await listOrderTypes(tenantId));
        // Always through buildEditorFormState — the editor is reached from a
        // persistent tab tree, so the add path has to be a clean slate rather
        // than whatever method was open last.
        const loaded = isNew ? null : await getPaymentMethod(methodId, tenantId);
        setForm(buildEditorFormState(loaded).form);
        setErrors({});
      } catch {
        setLoadError("Could not load this payment method.");
      } finally {
        setIsLoading(false);
      }
    })();
  }, [tenantId, methodId, isNew]);

  const updateField = <K extends keyof PaymentMethodInput>(
    key: K,
    value: PaymentMethodInput[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleOrderType = (orderTypeId: string) => {
    setForm((prev) => ({
      ...prev,
      order_type_ids: prev.order_type_ids.includes(orderTypeId)
        ? prev.order_type_ids.filter((id) => id !== orderTypeId)
        : [...prev.order_type_ids, orderTypeId],
    }));
  };

  /** True when this session may not write; alerts the merchant if so. */
  const blockedByDemo = (): boolean => {
    if (!useAuthStore.getState().isDemo) return false;
    Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
    return true;
  };

  const handlePickQr = async () => {
    if (blockedByDemo()) return;
    const outcome = await pickQrImage();
    if (outcome.status === "unavailable") {
      Alert.alert(
        "Photo picker unavailable",
        "Update to the latest app build to add a QR code.",
      );
      return;
    }
    if (outcome.status === "permission-denied") {
      Alert.alert("Permission needed", "Allow photo access to add a QR code.");
      return;
    }
    if (outcome.status === "canceled") return;

    setIsUploadingQr(true);
    try {
      const upload = await uploadPaymentQr(outcome.image);
      updateField("qr_code_url", upload.url);
    } catch {
      Alert.alert("Upload failed", "Could not upload the QR code. Please try again.");
    } finally {
      setIsUploadingQr(false);
    }
  };

  const handleSave = async () => {
    if (blockedByDemo()) return;
    if (!tenantId) return;

    const validation = validatePaymentMethodInput(form);
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }
    setErrors({});
    setIsSaving(true);
    try {
      if (isNew) {
        const created = await createPaymentMethod(tenantId, form);
        // goTo, not router.replace: replacing into a route inside the tab
        // navigator renames its state key and remounts it, which crashes with
        // "Cannot read property 'stale' of undefined". See lib/tab-navigation.ts.
        goTo(router, paymentMethodHref(created));
        Alert.alert("Saved", "Payment method added.");
      } else {
        await updatePaymentMethod(methodId, tenantId, form);
        Alert.alert("Saved", "Payment method updated.");
        router.back();
      }
    } catch {
      Alert.alert("Error", "Could not save this payment method. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (blockedByDemo()) return;
    Alert.alert(
      "Delete payment method",
      "Customers will no longer be offered this at checkout. Delete it?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (!tenantId) return;
            try {
              await deletePaymentMethod(methodId, tenantId);
              router.back();
            } catch {
              // Past orders reference the method, so the database may refuse.
              // Deactivating leaves those receipts intact.
              Alert.alert(
                "Could not delete",
                "This method may be used by past orders. Switch it off instead.",
              );
            }
          },
        },
      ],
    );
  };

  if (isLoading) {
    return <LoadingState fullScreen message="Loading payment method..." />;
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{isNew ? "New Payment Method" : "Edit Payment Method"}</Text>
      {loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}

      <TouchableOpacity style={styles.qrPicker} onPress={handlePickQr} activeOpacity={0.8}>
        {form.qr_code_url ? (
          <Image
            source={{ uri: form.qr_code_url }}
            style={styles.qr}
            resizeMode="contain"
            accessibilityLabel={form.name ? `${form.name} QR code` : "QR code"}
          />
        ) : (
          <Text style={styles.qrPlaceholder}>
            {isUploadingQr ? "Uploading..." : "+ Add QR code (optional)"}
          </Text>
        )}
      </TouchableOpacity>
      {errors.qr_code_url && <Text style={styles.errorText}>{errors.qr_code_url}</Text>}

      <Card style={styles.card}>
        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          value={form.name}
          onChangeText={(v) => updateField("name", v)}
          placeholder="e.g. GCash"
          placeholderTextColor={colors.textTertiary}
        />
        {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}

        <Text style={styles.label}>Instructions</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={form.details}
          onChangeText={(v) => updateField("details", v)}
          placeholder="e.g. Send to 0917 123 4567 (Juan D.)"
          placeholderTextColor={colors.textTertiary}
          multiline
        />

        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text style={styles.label}>Active</Text>
            <Text style={styles.hint}>Off hides it from checkout</Text>
          </View>
          <Switch
            value={form.is_active}
            onValueChange={(v) => updateField("is_active", v)}
            trackColor={{ false: colors.separator, true: colors.success }}
          />
        </View>

        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text style={styles.label}>Require payment proof</Text>
            <Text style={styles.hint}>
              Customers must attach a screenshot or reference number
            </Text>
          </View>
          <Switch
            value={form.require_payment_proof}
            onValueChange={(v) => updateField("require_payment_proof", v)}
            trackColor={{ false: colors.separator, true: colors.primary }}
          />
        </View>
      </Card>

      <Card title="Offered for" style={styles.card}>
        <Text style={styles.hint}>
          Pick the order types this method is available for.
        </Text>
        {orderTypes.map((orderType) => {
          const isChosen = form.order_type_ids.includes(orderType.id);
          return (
            <TouchableOpacity
              key={orderType.id}
              style={styles.checkRow}
              onPress={() => toggleOrderType(orderType.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isChosen }}
              accessibilityLabel={orderType.name}
            >
              <View style={[styles.checkbox, isChosen && styles.checkboxChecked]}>
                {isChosen ? <Text style={styles.checkboxMark}>✓</Text> : null}
              </View>
              <Text style={styles.checkLabel}>{orderType.name}</Text>
            </TouchableOpacity>
          );
        })}
        {errors.order_type_ids && (
          <Text style={styles.errorText}>{errors.order_type_ids}</Text>
        )}
      </Card>

      <TouchableOpacity
        style={[styles.saveButton, isSaving && styles.buttonBusy]}
        onPress={handleSave}
        disabled={isSaving}
        accessibilityRole="button"
      >
        <Text style={styles.saveButtonText}>
          {isSaving ? "Saving..." : "Save Payment Method"}
        </Text>
      </TouchableOpacity>

      {!isNew && (
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={handleDelete}
          accessibilityRole="button"
        >
          <Text style={styles.deleteButtonText}>Delete Payment Method</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: 60, paddingBottom: spacing.xxl },
  title: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.lg },
  qrPicker: {
    height: 160,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
    overflow: "hidden",
  },
  qr: { width: "100%", height: "100%" },
  qrPlaceholder: { ...typography.body, color: colors.textSecondary },
  card: { marginBottom: spacing.lg, ...shadow.sm },
  label: {
    ...typography.eyebrow,
    color: colors.textSecondary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  hint: { ...typography.small, color: colors.textTertiary, marginTop: 2 },
  input: {
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.textPrimary,
  },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  errorText: { ...typography.small, color: colors.danger, marginTop: spacing.xs },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  switchText: { flex: 1 },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.separator,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkboxMark: { color: colors.textOnDark, fontWeight: "700" },
  checkLabel: { ...typography.body, color: colors.textPrimary },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: spacing.lg,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  buttonBusy: { opacity: 0.6 },
  saveButtonText: { ...typography.body, color: colors.textOnDark, fontWeight: "700" },
  deleteButton: { alignItems: "center", marginTop: spacing.lg },
  deleteButtonText: { ...typography.body, color: colors.danger, fontWeight: "600" },
});
