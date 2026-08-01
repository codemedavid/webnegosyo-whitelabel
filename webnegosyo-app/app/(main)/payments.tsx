import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Switch,
  Image,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { useAuthStore } from "../../stores/auth-store";
import { DEMO_READONLY_MESSAGE } from "../../lib/demo";
import { NEW_PAYMENT_METHOD_ID, paymentMethodHref } from "../../lib/navigation";
import {
  isOfferedNowhere,
  listManagedPaymentMethods,
  moveMethod,
  reorderPaymentMethods,
  togglePaymentMethodStatus,
  type ManagedPaymentMethod,
  type MoveDirection,
} from "../../lib/payment-methods";
import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import { LoadingState } from "../../components/LoadingState";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { WorkspaceSwitcher } from "../../components/WorkspaceSwitcher";

export default function PaymentMethodsScreen() {
  const tenantId = useAuthStore((s) => s.tenantId);

  const [methods, setMethods] = useState<ManagedPaymentMethod[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      setError(null);
      setMethods(await listManagedPaymentMethods(tenantId));
    } catch {
      setError("Could not load payment methods. Pull down to try again.");
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  /** True when this session may not write; alerts the merchant if so. */
  const blockedByDemo = (): boolean => {
    if (!useAuthStore.getState().isDemo) return false;
    Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
    return true;
  };

  const handleToggle = async (method: ManagedPaymentMethod) => {
    if (blockedByDemo() || !tenantId) return;

    const nextActive = !method.is_active;
    setMethods((prev) =>
      prev.map((m) => (m.id === method.id ? { ...m, is_active: nextActive } : m)),
    );
    try {
      await togglePaymentMethodStatus(method.id, tenantId, nextActive);
    } catch {
      // Rolling back matters more here than elsewhere: a row left showing
      // "on" that is actually off means the merchant believes they can be
      // paid a way their customers are never offered.
      setMethods((prev) =>
        prev.map((m) =>
          m.id === method.id ? { ...m, is_active: method.is_active } : m,
        ),
      );
      Alert.alert("Error", "Could not change that payment method.");
    }
  };

  const handleMove = async (method: ManagedPaymentMethod, direction: MoveDirection) => {
    if (blockedByDemo() || !tenantId) return;

    const previous = methods;
    const reordered = moveMethod(methods, method.id, direction);
    setMethods(reordered);
    try {
      await reorderPaymentMethods(tenantId, reordered);
    } catch {
      setMethods(previous);
      Alert.alert("Error", "Could not reorder your payment methods.");
    }
  };

  const handleAdd = () => {
    if (blockedByDemo()) return;
    router.push(paymentMethodHref(NEW_PAYMENT_METHOD_ID));
  };

  return (
    <View style={styles.screen}>
      <View style={styles.headerWrap}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Payment Methods</Text>
            <Text style={styles.subtitle}>How customers pay you at checkout</Text>
          </View>
          <WorkspaceSwitcher />
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={handleAdd}
          accessibilityRole="button"
          accessibilityLabel="Add a payment method"
        >
          <Text style={styles.addButtonText}>+ Add payment method</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {isLoading ? (
          <LoadingState message="Loading payment methods..." />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : methods.length === 0 ? (
          <EmptyState message="No payment methods yet. Add one so customers can pay you." />
        ) : (
          methods.map((method, index) => (
            <View key={method.id} style={styles.row}>
              <TouchableOpacity
                style={styles.rowMain}
                activeOpacity={0.7}
                onPress={() => router.push(paymentMethodHref(method.id))}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${method.name}`}
              >
                {method.qr_code_url ? (
                  <Image
                    source={{ uri: method.qr_code_url }}
                    style={styles.qr}
                    accessibilityLabel={`${method.name} QR code`}
                  />
                ) : (
                  <View style={[styles.qr, styles.qrEmpty]}>
                    <Text style={styles.qrEmptyText}>No QR</Text>
                  </View>
                )}
                <View style={styles.rowText}>
                  <Text style={styles.name} numberOfLines={1}>
                    {method.name}
                  </Text>
                  {method.details ? (
                    <Text style={styles.details} numberOfLines={1}>
                      {method.details}
                    </Text>
                  ) : null}
                  <View style={styles.badgeRow}>
                    {isOfferedNowhere(method) ? (
                      <View style={[styles.badge, styles.badgeWarning]}>
                        <Text style={[styles.badgeText, styles.badgeWarningText]}>
                          Not offered anywhere
                        </Text>
                      </View>
                    ) : null}
                    {method.require_payment_proof ? (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>Proof required</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </TouchableOpacity>

              <View style={styles.rowControls}>
                <Switch
                  value={method.is_active}
                  onValueChange={() => handleToggle(method)}
                  trackColor={{ false: colors.separator, true: colors.success }}
                  accessibilityLabel={`${method.name} active`}
                />
                <View style={styles.moveRow}>
                  <TouchableOpacity
                    style={[styles.moveButton, index === 0 && styles.moveButtonDisabled]}
                    disabled={index === 0}
                    onPress={() => handleMove(method, "up")}
                    accessibilityRole="button"
                    accessibilityLabel={`Move ${method.name} up`}
                  >
                    <Text style={styles.moveButtonText}>↑</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.moveButton,
                      index === methods.length - 1 && styles.moveButtonDisabled,
                    ]}
                    disabled={index === methods.length - 1}
                    onPress={() => handleMove(method, "down")}
                    accessibilityRole="button"
                    accessibilityLabel={`Move ${method.name} down`}
                  >
                    <Text style={styles.moveButtonText}>↓</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  headerWrap: {
    paddingTop: 60,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  headerText: { flex: 1 },
  title: { ...typography.title, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  addButton: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  addButtonText: { ...typography.body, color: colors.textOnDark, fontWeight: "700" },
  list: { flex: 1 },
  content: { padding: spacing.lg, paddingTop: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    ...shadow.sm,
  },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md },
  qr: { width: 48, height: 48, borderRadius: radius.sm, backgroundColor: colors.background },
  qrEmpty: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.separator,
    borderStyle: "dashed",
  },
  qrEmptyText: { ...typography.small, color: colors.textTertiary },
  rowText: { flex: 1 },
  name: { ...typography.body, color: colors.textPrimary, fontWeight: "600" },
  details: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.xs },
  badge: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    backgroundColor: colors.background,
  },
  badgeText: { fontSize: 11, fontWeight: "700", color: colors.textSecondary },
  badgeWarning: { backgroundColor: colors.warningLight },
  badgeWarningText: { color: colors.warning },
  rowControls: { alignItems: "center", gap: spacing.sm },
  moveRow: { flexDirection: "row", gap: spacing.xs },
  moveButton: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  moveButtonDisabled: { opacity: 0.3 },
  moveButtonText: { ...typography.body, color: colors.textSecondary, fontWeight: "700" },
});
