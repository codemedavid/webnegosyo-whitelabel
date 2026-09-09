import React, { memo, useCallback } from "react";
import { OrderCard, type OrderCardOrder } from "./OrderCard";

/**
 * One row of the Orders tab.
 *
 * `OrderCard` takes closures; a list that built them inline handed every row
 * new props on every render, which is why memoising the card alone bought
 * nothing. This row takes the id-based callbacks the screen holds stable and
 * turns them into the card's closures itself, so a row re-renders only when
 * its own order row, busy flag, or one of the shared callbacks changes.
 */

export interface OrderListRowOrder extends OrderCardOrder {
  status: string;
}

interface OrderListRowProps<O extends OrderListRowOrder> {
  order: O;
  /** Label for the advance action, e.g. "Confirmed"; omit when there is none. */
  nextStatusLabel?: string;
  /** True while a status change for this order is in flight — actions hide. */
  isBusy: boolean;
  onOpen: (orderId: string) => void;
  onAdvance: (orderId: string) => void;
  onCancel: (order: O) => void;
}

function OrderListRowInner<O extends OrderListRowOrder>({
  order,
  nextStatusLabel,
  isBusy,
  onOpen,
  onAdvance,
  onCancel,
}: OrderListRowProps<O>) {
  const handleOpen = useCallback(() => onOpen(order._id), [onOpen, order._id]);
  const handleAdvance = useCallback(() => onAdvance(order._id), [onAdvance, order._id]);
  const handleCancel = useCallback(() => onCancel(order), [onCancel, order]);

  const canCancel = order.status !== "delivered" && order.status !== "cancelled";
  const canAdvance = nextStatusLabel !== undefined && !isBusy;

  return (
    <OrderCard
      order={order}
      onPress={handleOpen}
      nextStatusLabel={canAdvance ? nextStatusLabel : undefined}
      onAdvance={canAdvance ? handleAdvance : undefined}
      onCancel={canCancel && !isBusy ? handleCancel : undefined}
    />
  );
}

export const OrderListRow = memo(OrderListRowInner) as typeof OrderListRowInner;
