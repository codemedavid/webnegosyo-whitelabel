import React, { useState } from "react";
import { Text, View } from "react-native";
import { Button } from "../Button";
import { ReportRangePicker } from "../ReportRangePicker";
import { SegmentedControl } from "../SegmentedControl";
import { formatPeso } from "../../lib/format";
import type { DeleteOrdersFlowState, DeletionMode } from "../../lib/order-deletion/use-delete-orders-flow";
import { CheckRow } from "./CheckRow";
import { deletionStyles as styles } from "./styles";

const MODES: readonly { label: string; value: DeletionMode }[] = [
  { label: "Dates", value: "range" },
  { label: "Pick orders", value: "selected" },
  { label: "Everything", value: "all" },
];

function OrderPicker({ flow }: { flow: DeleteOrdersFlowState }) {
  if (!flow.listedOrders) return null;
  if (flow.listedOrders.length === 0) return <Text style={styles.caption}>No orders on those dates.</Text>;
  return (
    <View style={{ gap: 10 }}>
      {flow.listedOrders.map((order) => (
        <CheckRow
          key={order.id}
          isChecked={flow.selectedIds.has(order.id)}
          onToggle={() => flow.toggleSelected(order.id)}
          label={`#${order.daily_number ?? "—"} · ${order.customer_name || "Guest"} · ${formatPeso(order.total)}`}
          hint={`${new Date(order.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })} · ${order.status}`}
        />
      ))}
    </View>
  );
}

export function ChooseOrdersStep({ flow }: { flow: DeleteOrdersFlowState }) {
  const [isPickerOpen, setPickerOpen] = useState(false);
  const rangeLabel = flow.range.from === flow.range.to ? flow.range.from : `${flow.range.from} → ${flow.range.to}`;
  const canReview = flow.mode !== "selected" || flow.selectedIds.size > 0;

  return (
    <View style={styles.panel}>
      <SegmentedControl options={MODES} value={flow.mode} onChange={flow.setMode} accessibilityPrefix="Delete" />
      {flow.mode === "all" ? (
        <Text style={styles.caption}>Every order this store has — a fresh start for your dashboard.</Text>
      ) : (
        <Button label={rangeLabel} icon="calendar" tone="secondary" onPress={() => setPickerOpen(true)} />
      )}
      {flow.mode === "selected" && (
        <Button label="Show orders" tone="ghost" onPress={flow.loadOrdersToPick} isLoading={flow.isBusy} />
      )}
      {flow.mode === "selected" && <OrderPicker flow={flow} />}
      <CheckRow
        isChecked={flow.includeActive}
        onToggle={() => flow.setIncludeActive(!flow.includeActive)}
        label="Include orders still in progress"
        hint="Leave off unless they are tests — a customer may still be waiting."
      />
      {flow.preview?.orderCount === 0 && <Text style={styles.caption}>No orders match. Nothing would be deleted.</Text>}
      <Button
        label="Review what will be deleted"
        onPress={flow.review}
        isLoading={flow.isBusy}
        disabled={!canReview}
        fullWidth
      />
      <ReportRangePicker
        visible={isPickerOpen}
        selection={flow.selection}
        nowMs={Date.now()}
        onApply={(picked) => {
          setPickerOpen(false);
          flow.setSelection(picked);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}
