import React, { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { spacing } from "../../../theme/colors";
import { ScreenHeader } from "../../ScreenHeader";
import { IconButton } from "../../IconButton";
import { OrderFilterBar, type SortOrder } from "../../OrderFilterBar";
import { OrderCard } from "../../OrderCard";
import { EmptyState } from "../../EmptyState";
import { CoachTarget } from "../spotlight";
import { mockIncomingOrder, mockQueue, type MockOrder } from "../../../lib/tutorial/mock-data";
import { MockAlert, SceneFrame, type SceneProps } from "./shared";

/** The Orders queue, drawn from the same cards and filter bar as orders.tsx. */
const FILTERS = ["all", "pending", "confirmed", "preparing", "ready", "delivered", "cancelled"] as const;
const NEXT: Record<string, string> = { pending: "Confirmed", confirmed: "Preparing", preparing: "Ready", ready: "Delivered" };
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function OrdersScene({ phase, tried, onTried }: SceneProps) {
  const [orders, setOrders] = useState<MockOrder[]>(() => [mockIncomingOrder(), ...mockQueue()]);
  const [filter, setFilter] = useState<string>("all");
  const [sort, setSort] = useState<SortOrder>("newest");
  const [search, setSearch] = useState("");
  const [alert, setAlert] = useState<"confirmed" | "cancel" | null>(null);

  const setStatus = (id: string, status: string) =>
    setOrders((prev) => prev.map((o) => (o._id === id ? { ...o, status } : o)));

  const advance = (order: MockOrder) => {
    const next = NEXT[order.status];
    if (!next) return;
    setStatus(order._id, next.toLowerCase());
    if (phase === "confirm" && next === "Confirmed") {
      setAlert("confirmed");
      onTried();
    }
  };

  const shown = orders
    .filter((o) => filter === "all" || o.status === filter)
    .filter((o) => !search || o.customerName.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (sort === "newest" ? b._creationTime - a._creationTime : a._creationTime - b._creationTime));
  const counts = Object.fromEntries(FILTERS.map((f) => [f, f === "all" ? orders.length : orders.filter((o) => o.status === f).length]));
  const targetId = orders[0]._id;

  return (
    <SceneFrame activeTab="orders">
      <ScreenHeader
        title="Orders"
        subtitle={`${shown.length} shown`}
        actions={
          <>
            <IconButton icon="export" label="Export" onPress={() => {}} />
            <IconButton icon="qr" label="Scan QR" tone="primary" onPress={() => {}} />
          </>
        }
      >
        <CoachTarget active={phase === "filter"} padding={4}>
          <OrderFilterBar
            filters={FILTERS.map((key) => ({ key, label: capitalize(key), count: counts[key] }))}
            activeFilter={filter}
            onFilterChange={(key) => {
              setFilter(key);
              if (phase === "filter" && key === "ready") onTried();
            }}
            sort={sort}
            onSortToggle={() => setSort((s) => (s === "newest" ? "oldest" : "newest"))}
            search={search}
            onSearchChange={setSearch}
          />
        </CoachTarget>
      </ScreenHeader>
      <ScrollView contentContainerStyle={styles.content}>
        {shown.length === 0 ? <EmptyState message={search ? "No orders match your search" : "No orders found"} /> : null}
        {shown.map((order) => {
          const isTarget = order._id === targetId && (phase === "confirm" || phase === "cancel") && !tried;
          const card = (
            <OrderCard
              order={order}
              onPress={() => {}}
              nextStatusLabel={NEXT[order.status]}
              onAdvance={NEXT[order.status] ? () => advance(order) : undefined}
              onCancel={order.status !== "delivered" && order.status !== "cancelled" ? () => setAlert("cancel") : undefined}
            />
          );
          return (
            <View key={order._id} style={styles.card}>
              {isTarget ? <CoachTarget active padding={4}>{card}</CoachTarget> : card}
            </View>
          );
        })}
      </ScrollView>

      {alert === "confirmed" ? (
        <MockAlert
          title="Order Confirmed"
          message="Open the order to print its receipt."
          actions={[
            { label: "Later", onPress: () => setAlert(null) },
            { label: "Open & print", tone: "bold", onPress: () => setAlert(null) },
          ]}
        />
      ) : null}
      {alert === "cancel" ? (
        <MockAlert
          title="Cancel this order?"
          message="It will be removed from the active queue and excluded from revenue."
          actions={[
            { label: "Keep Order", onPress: () => setAlert(null) },
            {
              label: "Cancel Order",
              tone: "destructive",
              onPress: () => {
                setStatus(targetId, "cancelled");
                setAlert(null);
                if (phase === "cancel") onTried();
              },
            },
          ]}
        />
      ) : null}
    </SceneFrame>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl * 2, paddingTop: spacing.xs },
  card: { marginBottom: spacing.md },
});
