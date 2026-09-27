import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { BackHeader } from "../../components/BackHeader";
import { SectionHeader } from "../../components/SectionHeader";
import { ChooseOrdersStep } from "../../components/order-deletion/ChooseOrdersStep";
import { DeletionHistoryList } from "../../components/order-deletion/DeletionHistoryList";
import { ConfirmStep, DoneStep, ExportStep } from "../../components/order-deletion/ExportConfirmSteps";
import { deletionStyles } from "../../components/order-deletion/styles";
import { useDeleteOrdersFlow } from "../../lib/order-deletion/use-delete-orders-flow";
import { useAuthStore } from "../../stores/auth-store";
import { colors, spacing } from "../../theme/colors";

/**
 * Owner-only: delete orders (a date range, picked orders, or everything) after
 * saving a backup and confirming with the store name and password. The web
 * routes re-check ownership; this screen only hides the door from everyone else.
 */
export default function DeleteOrdersScreen() {
  const tenantId = useAuthStore((s) => s.tenantId);
  const tenantName = useAuthStore((s) => s.tenantName);
  const isOwner = useAuthStore((s) => s.isOwner);
  const role = useAuthStore((s) => s.role);
  const orderBackend = useAuthStore((s) => s.orderBackend);
  const isDemo = useAuthStore((s) => s.isDemo);

  const isAllowed = !isDemo && isOwner && role === "admin" && !!tenantId && orderBackend === "platform";

  return (
    <View style={styles.screen}>
      <BackHeader title="Delete orders" />
      {isAllowed && tenantId ? (
        <DeleteOrdersBody tenantId={tenantId} storeName={tenantName ?? ""} />
      ) : (
        <View style={styles.content}>
          <Text style={deletionStyles.caption}>
            Only the store owner can delete orders, and it is not available for this store yet.
          </Text>
        </View>
      )}
    </View>
  );
}

function DeleteOrdersBody({ tenantId, storeName }: { tenantId: string; storeName: string }) {
  const flow = useDeleteOrdersFlow(tenantId);
  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={[deletionStyles.caption, styles.intro]}>
        Deleted orders leave your orders list and dashboard. You can restore them for 7 days; after that they are
        erased. Customers, loyalty stamps, stock and voucher usage do not change.
      </Text>
      {flow.error && <Text style={[deletionStyles.error, styles.intro]}>{flow.error}</Text>}
      {flow.step === "choose" && <ChooseOrdersStep flow={flow} />}
      {flow.step === "export" && <ExportStep flow={flow} />}
      {flow.step === "confirm" && <ConfirmStep flow={flow} storeName={storeName} />}
      {flow.step === "done" && <DoneStep flow={flow} />}
      <SectionHeader title="Deletion history" />
      <DeletionHistoryList tenantId={tenantId} refreshKey={flow.result} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: 0, paddingBottom: spacing.xxl },
  intro: { marginBottom: spacing.lg },
});
