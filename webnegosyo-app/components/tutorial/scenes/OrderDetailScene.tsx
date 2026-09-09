import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radius, shadow, spacing, typography } from "../../../theme/colors";
import { BackHeader } from "../../BackHeader";
import { Badge } from "../../Badge";
import { Button } from "../../Button";
import { Card } from "../../Card";
import { StatusStepper, type StepperStatus } from "../../order/StatusStepper";
import { CoachTarget } from "../spotlight";
import { formatPeso } from "../../../lib/format";
import { mockIncomingOrder } from "../../../lib/tutorial/mock-data";
import { SceneFrame, type SceneProps } from "./shared";

/** One order, as order/[orderId].tsx lays it out, walked from Confirmed to Delivered. */
const NEXT: Partial<Record<StepperStatus, StepperStatus>> = { pending: "confirmed", confirmed: "preparing", preparing: "ready", ready: "delivered" };
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function OrderDetailScene({ phase, tried, onTried }: SceneProps) {
  const order = mockIncomingOrder();
  const [status, setStatus] = useState<StepperStatus>(phase === "advance" ? "confirmed" : "pending");
  const next = NEXT[status];

  const advance = () => {
    if (!next) return;
    setStatus(next);
    if (next === "delivered") onTried();
  };

  return (
    <SceneFrame workspace="operations" activeTab="orders">
      <BackHeader title="Order details" subtitle={order.customerName} actions={<Badge label={status} variant={status} />} />
      <ScrollView contentContainerStyle={styles.content}>
        <StatusStepper currentStatus={status} />
        <Card title="Customer">
          <Text style={styles.name}>{order.customerName}</Text>
          <Text style={styles.meta}>{order.customerContact}</Text>
          <View style={styles.row}>
            <View style={styles.typePill}><Text style={styles.typePillText}>Pickup</Text></View>
            <Text style={styles.meta}>Smart Menu · just now</Text>
          </View>
        </Card>
        <Card title={`Items (${order.itemCount})`}>
          {order.lines.map((line) => (
            <View key={line.name} style={styles.line}>
              <View style={styles.lineCopy}>
                <Text style={styles.lineName}>{line.name}</Text>
                {line.detail ? <Text style={styles.meta}>{line.detail}</Text> : null}
              </View>
              <Text style={styles.meta}>x{line.quantity}</Text>
              <Text style={styles.lineAmount}>{formatPeso(line.unitPrice * line.quantity)}</Text>
            </View>
          ))}
          <View style={styles.divider} />
          <View style={styles.line}>
            <Text style={styles.meta}>Subtotal</Text>
            <Text style={styles.lineAmount}>{formatPeso(order.total)}</Text>
          </View>
          <View style={styles.line}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.total}>{formatPeso(order.total)}</Text>
          </View>
        </Card>
        <Card title="Payment">
          <Text style={styles.name}>GCash</Text>
          <Text style={styles.meta}>Reference # 4021 8837 · Status: paid</Text>
        </Card>
        <View style={styles.actions}>
          {status === "delivered" ? (
            <View style={styles.done}>
              <Text style={styles.doneText}>Handed over to {order.customerName}. Counted in today&apos;s revenue.</Text>
            </View>
          ) : (
            <>
              <Button label="Edit in register" tone="secondary" onPress={() => {}} size="lg" />
              <CoachTarget active={phase === "advance" && !tried}>
                <Button label={`Mark as ${capitalize(next ?? "")}`} onPress={advance} size="lg" />
              </CoachTarget>
              <Button label="Reprint Receipt" tone="secondary" onPress={() => {}} size="lg" />
              <TouchableOpacity style={styles.cancelLink} accessibilityRole="button">
                <Text style={styles.cancelText}>Cancel Order</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </SceneFrame>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, paddingTop: 0, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  name: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  meta: { ...typography.caption, color: colors.textSecondary },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs },
  typePill: { backgroundColor: colors.primaryLight, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  typePillText: { ...typography.small, fontWeight: "700", color: colors.textPrimary },
  line: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 4 },
  lineCopy: { flex: 1 },
  lineName: { ...typography.body, color: colors.textPrimary },
  lineAmount: { ...typography.body, fontWeight: "600", color: colors.textPrimary, minWidth: 70, textAlign: "right" },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginVertical: spacing.xs },
  totalLabel: { ...typography.heading, color: colors.textPrimary, flex: 1 },
  total: { ...typography.heading, color: colors.textPrimary },
  actions: { gap: spacing.sm, marginTop: spacing.xs },
  cancelLink: { alignItems: "center", paddingVertical: spacing.md },
  cancelText: { ...typography.body, fontWeight: "700", color: colors.danger },
  done: { backgroundColor: colors.successLight, borderRadius: radius.md, padding: spacing.lg, ...shadow.sm },
  doneText: { ...typography.body, color: colors.success, fontWeight: "600", textAlign: "center" },
});
