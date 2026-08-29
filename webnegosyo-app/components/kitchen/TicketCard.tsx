import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import {
  formatTicketTimer,
  kitchenItemLabel,
  type KitchenTicket,
} from "../../lib/kitchen-tickets";
import { getUrgency, getOrderTypeMeta, type Urgency } from "../../lib/order-visuals";
import {
  PREP_MINUTE_PRESETS,
  PREP_MINUTE_EXTENDED,
  PREP_EXTEND_MINUTES,
  formatClock,
  prepPromiseState,
} from "../../lib/prep-time";

/**
 * One ticket on the kitchen board. Presentation only: the card renders what
 * lib/kitchen-tickets.ts decided, and hands bump/print intents back up.
 *
 * The board runs its own dark palette rather than the cream theme: a kitchen
 * display is read from across a hot line, at an angle, under harsh light —
 * white-on-near-black with big type is the KDS convention for a reason.
 */

export const kds = {
  background: "#111113",
  card: "#1C1C1F",
  cardBorder: "#2A2A2E",
  ink: "#F5F5F4",
  inkSoft: "#A1A1AA",
  struck: "#52525B",
  fresh: "#34D399",
  warning: "#FBBF24",
  urgent: "#F87171",
  bump: "#047857",
  print: "#27272A",
} as const;

const URGENCY_COLOR: Record<Urgency, string> = {
  fresh: kds.fresh,
  warning: kds.warning,
  urgent: kds.urgent,
};

interface TicketCardProps {
  ticket: KitchenTicket;
  /** Re-renders the timer; the screen ticks it so every card agrees on "now". */
  nowMs: number;
  isNew: boolean;
  onBump: (orderId: string) => void;
  onPrint: (ticket: KitchenTicket) => void;
  canPrint: boolean;
  /**
   * False when this store's backend cannot store a prep time (a Convex
   * deployment on an older bundle). The control is hidden rather than offered
   * and left to throw on tap.
   */
  canSetPrepTime: boolean;
  onSetPrepTime: (orderId: string, minutes: number) => void;
}

export function TicketCard({
  ticket,
  nowMs,
  isNew,
  onBump,
  onPrint,
  canPrint,
  canSetPrepTime,
  onSetPrepTime,
}: TicketCardProps) {
  // The longer preset row, revealed on demand. Local to the card: which ticket
  // needed an unusual time is not worth remembering past this render.
  const [showMoreMinutes, setShowMoreMinutes] = useState(false);
  // Struck items are this display's working memory, not order state: a cook
  // crossing off the fries plates nothing and syncs nowhere.
  const [struck, setStruck] = useState<ReadonlySet<number>>(new Set());

  const { order, items } = ticket;
  const urgency = getUrgency(order._creationTime, nowMs);
  const accent = URGENCY_COLOR[urgency];
  const typeLabel = order.orderType ? getOrderTypeMeta(order.orderType).label : null;

  const promisedMs = order.promisedReadyAt ? Date.parse(order.promisedReadyAt) : null;
  const promise = prepPromiseState(
    promisedMs !== null && !Number.isNaN(promisedMs) ? promisedMs : null,
    nowMs,
  );

  const toggleStruck = (index: number) => {
    setStruck((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <View style={[styles.card, { borderTopColor: accent }, isNew && styles.cardNew]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.orderRef}>#{order._id.slice(-4).toUpperCase()}</Text>
          {typeLabel ? <Text style={styles.typeChip}>{typeLabel.toUpperCase()}</Text> : null}
        </View>
        <Text style={[styles.timer, { color: accent }]}>
          {formatTicketTimer(order._creationTime, nowMs)}
        </Text>
      </View>
      <Text style={styles.customer} numberOfLines={1}>
        {order.customerName}
        {order.status === "preparing" ? "  ·  PREPARING" : ""}
      </Text>

      <View style={styles.items}>
        {items.length === 0 ? (
          <Text style={styles.loadingItems}>Loading items…</Text>
        ) : (
          items.map((item, index) => {
            const isStruck = struck.has(index);
            return (
              <TouchableOpacity
                key={index}
                onPress={() => toggleStruck(index)}
                activeOpacity={0.7}
                style={styles.itemRow}
              >
                <Text style={[styles.itemQty, isStruck && styles.itemStruck]}>
                  {item.quantity}×
                </Text>
                <View style={styles.itemBody}>
                  <Text style={[styles.itemName, isStruck && styles.itemStruck]}>
                    {kitchenItemLabel(item)}
                  </Text>
                  {(item.addons ?? []).map((addon, addonIndex) => (
                    <Text
                      key={addonIndex}
                      style={[styles.itemDetail, isStruck && styles.itemStruck]}
                    >
                      + {addon.name}
                    </Text>
                  ))}
                  {item.specialInstructions ? (
                    <Text style={[styles.itemNote, isStruck && styles.itemStruck]}>
                      ✱ {item.specialInstructions}
                    </Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      {canSetPrepTime ? (
        promise.kind === "none" ? (
          <View style={styles.prepRow}>
            <Text style={styles.prepLabel}>Ready in</Text>
            {(showMoreMinutes ? PREP_MINUTE_EXTENDED : PREP_MINUTE_PRESETS).map((minutes) => (
              <TouchableOpacity
                key={minutes}
                style={styles.prepChip}
                onPress={() => onSetPrepTime(order._id, minutes)}
                activeOpacity={0.8}
              >
                <Text style={styles.prepChipText}>{minutes}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.prepMore}
              onPress={() => setShowMoreMinutes((open) => !open)}
              activeOpacity={0.8}
            >
              <Text style={styles.prepMoreText}>{showMoreMinutes ? "Less" : "More"}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.prepRow}>
            <Text
              style={[
                styles.prepPromise,
                promise.kind === "late" && styles.prepPromiseLate,
              ]}
            >
              {promise.kind === "late"
                ? `Late by ${promise.minutesLate}m`
                : `Ready ${formatClock(promisedMs as number)}`}
            </Text>
            <TouchableOpacity
              style={styles.prepChip}
              onPress={() =>
                onSetPrepTime(
                  order._id,
                  (order.prepMinutes ?? 0) + PREP_EXTEND_MINUTES,
                )
              }
              activeOpacity={0.8}
            >
              <Text style={styles.prepChipText}>+{PREP_EXTEND_MINUTES}</Text>
            </TouchableOpacity>
          </View>
        )
      ) : null}

      <View style={styles.actions}>
        {canPrint ? (
          <TouchableOpacity
            style={styles.printButton}
            onPress={() => onPrint(ticket)}
            activeOpacity={0.8}
          >
            <Text style={styles.printText}>Print</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={styles.bumpButton}
          onPress={() => onBump(order._id)}
          activeOpacity={0.8}
        >
          <Text style={styles.bumpText}>Bump · Ready</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: kds.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: kds.cardBorder,
    borderTopWidth: 4,
    padding: 12,
    flex: 1,
  },
  cardNew: {
    borderColor: kds.fresh,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
  },
  orderRef: {
    color: kds.ink,
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  typeChip: {
    color: kds.inkSoft,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    borderWidth: 1,
    borderColor: kds.cardBorder,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: "hidden",
  },
  timer: {
    fontSize: 18,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  customer: {
    color: kds.inkSoft,
    fontSize: 13,
    fontWeight: "600",
    marginTop: 2,
  },
  items: {
    marginTop: 10,
    gap: 8,
  },
  loadingItems: {
    color: kds.inkSoft,
    fontSize: 14,
    fontStyle: "italic",
  },
  itemRow: {
    flexDirection: "row",
    gap: 8,
  },
  itemQty: {
    color: kds.ink,
    fontSize: 17,
    fontWeight: "800",
    minWidth: 30,
    fontVariant: ["tabular-nums"],
  },
  itemBody: {
    flex: 1,
  },
  itemName: {
    color: kds.ink,
    fontSize: 17,
    fontWeight: "700",
    lineHeight: 22,
  },
  itemDetail: {
    color: kds.inkSoft,
    fontSize: 14,
    fontWeight: "600",
    marginTop: 1,
  },
  itemNote: {
    color: kds.warning,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 1,
  },
  itemStruck: {
    textDecorationLine: "line-through",
    color: kds.struck,
  },
  prepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    flexWrap: "wrap",
  },
  prepLabel: {
    color: kds.inkSoft,
    fontSize: 12,
    fontWeight: "700",
    marginRight: 2,
  },
  prepChip: {
    borderWidth: 1,
    borderColor: kds.cardBorder,
    borderRadius: 6,
    paddingHorizontal: 11,
    paddingVertical: 7,
    minWidth: 40,
    alignItems: "center",
  },
  prepChipText: {
    color: kds.ink,
    fontSize: 14,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  prepMore: {
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  prepMoreText: {
    color: kds.inkSoft,
    fontSize: 12,
    fontWeight: "700",
  },
  prepPromise: {
    color: kds.fresh,
    fontSize: 14,
    fontWeight: "800",
    flex: 1,
  },
  prepPromiseLate: {
    color: kds.urgent,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  printButton: {
    backgroundColor: kds.print,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: kds.cardBorder,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  printText: {
    color: kds.ink,
    fontSize: 14,
    fontWeight: "700",
  },
  bumpButton: {
    flex: 1,
    backgroundColor: kds.bump,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  bumpText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
});
