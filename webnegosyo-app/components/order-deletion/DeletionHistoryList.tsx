import React, { useCallback, useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";
import { Button } from "../Button";
import { formatPeso } from "../../lib/format";
import type { DeletionRecord } from "../../lib/order-deletion/client";
import { orderDeletionClient } from "../../lib/order-deletion/default-client";
import { deletionStyles as styles } from "./styles";

const STATUS_LABEL: Record<DeletionRecord["status"], string> = {
  exported: "Exported, not deleted",
  deleted: "Deleted — restorable",
  restored: "Restored",
  purged: "Erased",
  expired: "Export expired",
};

function when(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });
}

function describe(deletion: DeletionRecord): string {
  const scope = deletion.scope;
  if (scope.kind === "all") return "All orders";
  if (scope.kind === "selected") return `${scope.orderIds.length} selected orders`;
  return scope.from === scope.to ? `Orders on ${scope.from}` : `Orders ${scope.from} → ${scope.to}`;
}

function isRestorable(deletion: DeletionRecord): boolean {
  return deletion.status === "deleted" && !!deletion.purge_after && new Date(deletion.purge_after) > new Date();
}

/** `refreshKey` changes whenever a deletion completes, so the list reloads. */
export function DeletionHistoryList({ tenantId, refreshKey }: { tenantId: string; refreshKey: unknown }) {
  const [deletions, setDeletions] = useState<DeletionRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDeletions(await orderDeletionClient.history(tenantId));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the history.");
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const restore = async (deletionId: string) => {
    setRestoringId(deletionId);
    try {
      await orderDeletionClient.restore(tenantId, deletionId);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not restore those orders.");
    } finally {
      setRestoringId(null);
    }
  };

  const confirmRestore = (deletion: DeletionRecord) => {
    Alert.alert(
      "Restore these orders?",
      `The ${deletion.deleted_order_count} orders come back exactly as they were and count in your dashboard again.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Restore", onPress: () => void restore(deletion.id) },
      ]
    );
  };

  if (error) return <Text style={styles.error}>{error}</Text>;
  if (!deletions) return <Text style={styles.caption}>Loading history…</Text>;
  if (deletions.length === 0) return <Text style={styles.caption}>No orders have been deleted.</Text>;

  return (
    <View style={{ gap: 12 }}>
      {deletions.map((deletion) => (
        <View key={deletion.id} style={styles.panel}>
          <Text style={styles.body}>{describe(deletion)}</Text>
          <Text style={styles.caption}>
            {deletion.deleted_order_count ?? deletion.order_count} orders · {formatPeso(deletion.order_total)} ·{" "}
            {when(deletion.deleted_at ?? deletion.exported_at)}
          </Text>
          <Text style={styles.caption}>{STATUS_LABEL[deletion.status]}</Text>
          {isRestorable(deletion) && (
            <>
              <Text style={styles.caption}>Restorable until {when(deletion.purge_after)}</Text>
              <Button
                label="Restore"
                tone="secondary"
                size="sm"
                onPress={() => confirmRestore(deletion)}
                isLoading={restoringId === deletion.id}
                disabled={restoringId !== null}
              />
            </>
          )}
        </View>
      ))}
    </View>
  );
}
