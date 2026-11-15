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

describe("OrderCard kitchen chip", () => {
  it("tells the cashier the kitchen has confirmed the order", () => {
    render(<OrderCard order={{ ...baseOrder, status: "preparing" }} onPress={jest.fn()} />);
    expect(screen.getByText("✓ Kitchen confirmed")).toBeTruthy();
  });

  it("claims nothing while the order still waits on the kitchen", () => {
    render(<OrderCard order={baseOrder} onPress={jest.fn()} />);
    expect(screen.queryByText("✓ Kitchen confirmed")).toBeNull();
    expect(screen.queryByText("✓ Kitchen")).toBeNull();
  });

  it("keeps a kitchen chip while a ready order waits to go out", () => {
    render(<OrderCard order={{ ...baseOrder, status: "ready" }} onPress={jest.fn()} />);
    expect(screen.getByText("✓ Kitchen")).toBeTruthy();
  });

  it.each(["delivered", "cancelled"])("shows no kitchen chip on a %s order", (status) => {
    render(<OrderCard order={{ ...baseOrder, status }} onPress={jest.fn()} />);
    expect(screen.queryByText(/Kitchen/)).toBeNull();
  });
});

describe("OrderCard Messenger chip", () => {
  const chat = {
    sessionId: "s1",
    photoUrl: "https://example.com/ana.jpg",
    label: "Messenger · Ana C.",
    facebookName: "Ana C.",
    hasNewMessage: true,
  };

  it("names the Messenger customer, shows their photo and flags a new message", () => {
    render(<OrderCard order={{ ...baseOrder, customerName: "Table 4", source: "messenger" }} onPress={jest.fn()} chat={chat} />);
    expect(screen.getByText("Messenger · Ana C.")).toBeTruthy();
    expect(screen.getByText("New message")).toBeTruthy();
    expect(screen.getByTestId("chat-avatar-photo")).toBeTruthy();
    // The chip replaces the bare source word.
    expect(screen.queryByText("messenger")).toBeNull();
  });

  it("uses the Facebook name for an order placed without one", () => {
    render(<OrderCard order={{ ...baseOrder, customerName: " " }} onPress={jest.fn()} chat={{ ...chat, hasNewMessage: false }} />);
    expect(screen.getByText("Ana C.")).toBeTruthy();
    expect(screen.queryByText("New message")).toBeNull();
  });

  it("keeps the initials when Meta gave no photo", () => {
    render(<OrderCard order={baseOrder} onPress={jest.fn()} chat={{ ...chat, photoUrl: null, label: "Messenger" }} />);
    expect(screen.getByText("Messenger")).toBeTruthy();
    expect(screen.queryByTestId("chat-avatar-photo")).toBeNull();
    expect(screen.getByText("MC")).toBeTruthy();
  });

  describe("an order staff rang up for the chat", () => {
    const SESSION = "0f9c1c2e-6f9a-4d7f-9c1b-2a3b4c5d6e7f";
    const rungUp = {
      ...baseOrder,
      status: "pending",
      source: "pos",
      _creationTime: Date.now() - 60_000,
      customerData: { messenger_session_id: SESSION },
    };
    const record = { orderId: "o1", state: "waiting" as const, outcome: "sent", summarySentAt: Date.now() - 50_000, createdAt: Date.now() - 55_000 };

    it("says it is waiting for the customer", () => {
      render(<OrderCard order={rungUp} onPress={jest.fn()} chat={{ ...chat, hasNewMessage: false, chatOrder: record }} />);
      expect(screen.getByText("Waiting for customer")).toBeTruthy();
    });

    it("flags a customer who asked for a change", () => {
      render(
        <OrderCard order={rungUp} onPress={jest.fn()} chat={{ ...chat, hasNewMessage: false, chatOrder: { ...record, state: "change_requested" } }} />,
      );
      expect(screen.getByText("Wants a change")).toBeTruthy();
    });

    it("credits the customer once they confirmed", () => {
      render(
        <OrderCard
          order={{ ...rungUp, status: "confirmed" }}
          onPress={jest.fn()}
          chat={{ ...chat, hasNewMessage: false, chatOrder: { ...record, state: "confirmed" } }}
        />,
      );
      expect(screen.getByText("Customer confirmed")).toBeTruthy();
    });

    it("never guesses 'not sent' where the list did not look the order up", () => {
      render(<OrderCard order={{ ...rungUp, _creationTime: Date.now() - 10 * 60_000 }} onPress={jest.fn()} chat={{ ...chat, hasNewMessage: false }} />);
      expect(screen.queryByText("Couldn't send")).toBeNull();
      expect(screen.queryByText("Waiting for customer")).toBeNull();
    });

    it("says so when it was looked up and nothing went out", () => {
      render(
        <OrderCard
          order={{ ...rungUp, _creationTime: Date.now() - 10 * 60_000 }}
          onPress={jest.fn()}
          chat={{ ...chat, hasNewMessage: false, chatOrder: null }}
        />,
      );
      expect(screen.getByText("Couldn't send")).toBeTruthy();
    });
  });

  it("is unchanged for an order that did not come from a chat", () => {
    render(<OrderCard order={{ ...baseOrder, source: "web" }} onPress={jest.fn()} />);
    expect(screen.getByText("web")).toBeTruthy();
    expect(screen.queryByText(/Messenger/)).toBeNull();
  });
});
