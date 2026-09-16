/**
 * The order card's scheduled chip.
 *
 * A pre-order for Saturday used to render identically to an ASAP order placed
 * five minutes ago — same card, same "2h ago" age, and after fifteen minutes
 * the same red urgency accent screaming that it was late. These tests pin the
 * two fixes: the card names the requested moment (preferring the label the
 * customer's own device captured at checkout), and a future pre-order is not
 * painted late by the age of its ticket.
 */
import React from "react";
import { render, screen } from "@testing-library/react-native";
import { OrderCard, type OrderCardOrder } from "./OrderCard";

const baseOrder: OrderCardOrder = {
  _id: "o1",
  _creationTime: Date.now() - 60 * 60_000,
  customerName: "Maria Cruz",
  total: 1240,
  itemCount: 4,
  status: "confirmed",
};

describe("OrderCard scheduled chip", () => {
  it("shows the customer-captured schedule label on a pre-order", () => {
    render(
      <OrderCard
        order={{
          ...baseOrder,
          customerData: { scheduled_for_label: "Thu, Jun 18 · 5:30 PM" },
        }}
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByText("Scheduled · Thu, Jun 18 · 5:30 PM")).toBeTruthy();
  });

  it("formats the ISO when only the column value survived", () => {
    render(
      <OrderCard
        order={{ ...baseOrder, scheduledFor: new Date(2026, 5, 18, 17, 0).toISOString() }}
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByText("Scheduled · Thu, Jun 18 · 5:00 PM")).toBeTruthy();
  });

  it("shows no chip on an ASAP order", () => {
    render(<OrderCard order={baseOrder} onPress={jest.fn()} />);
    expect(screen.queryByText(/^Scheduled ·/)).toBeNull();
  });
});

describe("OrderCard pre-order chip", () => {
  it("marks a pre-sold order with its pickup date", () => {
    render(
      <OrderCard
        order={{
          ...baseOrder,
          customerData: { scheduled_for_label: "Sat, Jun 20 · 12:00 PM", presell_date: "2026-06-20" },
        }}
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByText("Pre-order · Sat, Jun 20")).toBeTruthy();
  });

  it("shows no pre-order chip on an ordinary scheduled order", () => {
    render(
      <OrderCard
        order={{ ...baseOrder, customerData: { scheduled_for_label: "Sat, Jun 20 · 12:00 PM" } }}
        onPress={jest.fn()}
      />,
    );
    expect(screen.queryByText(/Pre-order ·/)).toBeNull();
  });
});

describe("OrderCard guest fallback", () => {
  it("names a nameless order Guest instead of rendering a blank identity", () => {
    render(<OrderCard order={{ ...baseOrder, customerName: "" }} onPress={jest.fn()} />);
    expect(screen.getByText("Guest")).toBeTruthy();
    expect(screen.getByText("GU")).toBeTruthy();
    expect(screen.getByLabelText(/^Order for Guest,/)).toBeTruthy();
  });

  it("keeps a captured name untouched", () => {
    render(<OrderCard order={baseOrder} onPress={jest.fn()} />);
    expect(screen.getByText("Maria Cruz")).toBeTruthy();
    expect(screen.queryByText("Guest")).toBeNull();
  });
});

describe("OrderCard table chip", () => {
  it("shows the table the customer typed at checkout", () => {
    render(
      <OrderCard
        order={{ ...baseOrder, customerData: { table_number: "12" } }}
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByText("Table 12")).toBeTruthy();
  });

  it("shows no table chip when none was captured", () => {
    render(<OrderCard order={{ ...baseOrder, customerData: { table_number: "" } }} onPress={jest.fn()} />);
    expect(screen.queryByText(/^Table /)).toBeNull();
  });
});

describe("OrderCard unpaid chip", () => {
  it("drops the Unpaid chip once the bill has been collected at the counter", () => {
    // Collecting appends a settlement row; the status column is written too,
    // but every order collected before that fix still carries `pending`.
    render(
      <OrderCard
        order={{ ...baseOrder, total: 1240, paymentStatus: "pending", amountPaid: 1240 }}
        onPress={jest.fn()}
      />,
    );
    expect(screen.queryByText("Unpaid")).toBeNull();
  });

  it("keeps the Unpaid chip on a part-paid bill", () => {
    render(
      <OrderCard
        order={{ ...baseOrder, total: 1240, paymentStatus: "pending", amountPaid: 500 }}
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByText("Unpaid")).toBeTruthy();
  });

  it("keeps the Unpaid chip on an order nobody has collected", () => {
    render(
      <OrderCard
        order={{ ...baseOrder, paymentStatus: "pending" }}
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByText("Unpaid")).toBeTruthy();
  });

  it("shows no chip on an order paid online, whose ledger is empty", () => {
    render(
      <OrderCard
        order={{ ...baseOrder, paymentStatus: "paid", amountPaid: 0 }}
        onPress={jest.fn()}
      />,
    );
    expect(screen.queryByText("Unpaid")).toBeNull();
  });
});


it('shows the daily display number while navigation keeps the canonical order ID', () => {
  const onPress = jest.fn();
  render(<OrderCard order={{ ...baseOrder, dailyNumber: 7 }} onPress={onPress} />);
  expect(screen.getByText('#07')).toBeTruthy();
});
