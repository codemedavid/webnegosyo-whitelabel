/**
 * The bill's building blocks, rendered: a guest card says what the guest owes
 * and offers the right actions, and the table pool hands a dish to the
 * highlighted guest in one tap.
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { GuestPartCard } from "./GuestPartCard";
import { TablePool } from "./TablePool";
import { BillOrdersCard } from "./BillOrdersCard";
import { billUnits } from "../../lib/bill/bill-split";
import { billPartViews } from "../../lib/bill/bill-parts";
import { EMPTY_PLAN, recordPartPayment, setGuests, setMode } from "../../lib/bill/bill-plan";
import { ROUND_ONE, ROUND_TWO } from "../../lib/bill/bill-fixtures";

const orders = [ROUND_ONE, ROUND_TWO];
const evenPlan = setGuests(setMode(EMPTY_PLAN, "even", 56000), 2);

describe("GuestPartCard", () => {
  it("offers to print and to collect the guest's share", () => {
    const [part] = billPartViews(orders, evenPlan, 0).parts;
    const onCollect = jest.fn();
    const onPrint = jest.fn();
    render(<GuestPartCard part={part} onCollect={onCollect} onPrint={onPrint} />);

    fireEvent.press(screen.getByRole("button", { name: "Collect ₱280.00" }));
    fireEvent.press(screen.getByRole("button", { name: "Print" }));

    expect(onCollect).toHaveBeenCalledTimes(1);
    expect(onPrint).toHaveBeenCalledTimes(1);
  });

  it("reads Paid and stops offering to collect once the guest has paid", () => {
    const [part] = billPartViews(orders, recordPartPayment(evenPlan, "even:0", 28000), 0).parts;
    render(<GuestPartCard part={part} onCollect={jest.fn()} />);

    expect(screen.getByText("Paid")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Collect/ })).toBeNull();
  });

  it("explains a refused collection instead of firing it", () => {
    const [part] = billPartViews(orders, evenPlan, 0).parts;
    const onCollect = jest.fn();
    render(<GuestPartCard part={part} onCollect={onCollect} collectDisabledReason="No permission" />);

    fireEvent.press(screen.getByRole("button", { name: "Collect ₱280.00" }));

    expect(onCollect).not.toHaveBeenCalled();
  });
});

describe("TablePool", () => {
  it("gives one piece of a dish to the highlighted guest", () => {
    const onGive = jest.fn();
    const units = billUnits(orders);
    render(<TablePool units={units} activeLabel="Guest 2" onGive={onGive} />);

    fireEvent.press(screen.getByRole("button", { name: "Give one Latte to Guest 2" }));

    expect(onGive).toHaveBeenCalledWith(units[0].id);
  });

  it("says so when every dish has a guest", () => {
    render(<TablePool units={[]} activeLabel="Guest 1" onGive={jest.fn()} />);

    expect(screen.getByText("Every dish has a guest")).toBeTruthy();
  });
});

describe("BillOrdersCard", () => {
  it("combines another order, and takes one off when there are several", () => {
    const onAdd = jest.fn();
    const onRemove = jest.fn();
    render(<BillOrdersCard orders={orders} isLocked={false} onAdd={onAdd} onRemove={onRemove} onOpen={jest.fn()} />);

    fireEvent.press(screen.getByRole("button", { name: "Combine another order" }));
    fireEvent.press(screen.getByRole("button", { name: "Take order #15 off this bill" }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith("order-b");
  });

  it("keeps the orders together once a guest has paid", () => {
    render(<BillOrdersCard orders={orders} isLocked onAdd={jest.fn()} onRemove={jest.fn()} onOpen={jest.fn()} />);

    expect(screen.queryByRole("button", { name: "Combine another order" })).toBeNull();
    expect(screen.queryByRole("button", { name: /off this bill/ })).toBeNull();
  });
});

describe("BillTotalsCard and GuestCountStepper", () => {
  // Imported here so the suite above reads top-down.
  const { BillTotalsCard } = jest.requireActual("./BillTotalsCard");
  const { GuestCountStepper } = jest.requireActual("./GuestCountStepper");

  it("leads with what is still owed, and says when the bill is paid", () => {
    const { rerender } = render(<BillTotalsCard summary={{ total: 560, paid: 60, owed: 500, orderCount: 2, hasPayments: true }} />);
    expect(screen.getByText("Still owed")).toBeTruthy();
    expect(screen.getByText("₱500.00")).toBeTruthy();

    rerender(<BillTotalsCard summary={{ total: 560, paid: 560, owed: 0, orderCount: 2, hasPayments: true }} />);
    expect(screen.getByText("Fully paid")).toBeTruthy();
  });

  it("steps the guest count and stops at two", () => {
    const onChange = jest.fn();
    render(<GuestCountStepper value={2} onChange={onChange} />);

    fireEvent.press(screen.getByRole("button", { name: "One more guest" }));
    fireEvent.press(screen.getByRole("button", { name: "One fewer guest" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(3);
  });
});
