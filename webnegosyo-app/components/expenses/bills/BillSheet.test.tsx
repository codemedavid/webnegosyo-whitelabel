/**
 * The bill sheet as an owner meets it: Mark paid first, the quieter answers
 * under it, inner steps swapped in place, and Android back stepping out one
 * level before the sheet closes.
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { BillSheet } from "./BillSheet";
import type { BillWrites } from "./use-bill-writes";
import { useLinkableExpenses } from "./use-linkable-expenses";
import { BILL_CATEGORIES, BILL_TODAY, billOf, paymentOf } from "../../../lib/expenses/bills-fixtures";
import { buildBillsView, findBillRow } from "../../../lib/expenses/bills-screen";
import { homeExpense } from "../../../lib/expenses/expenses-home-fixtures";

jest.mock("./use-linkable-expenses", () => ({
  useLinkableExpenses: jest.fn(() => ({ expenses: [], isLoading: false, error: null, retry: jest.fn() })),
}));

const ok = <T,>(value: T) => Promise.resolve({ ok: true as const, value });

function fakeWrites(overrides: Partial<BillWrites> = {}): BillWrites {
  return {
    isBusy: false,
    create: jest.fn(() => ok(billOf())),
    update: jest.fn(() => ok(billOf())),
    pause: jest.fn(() => ok(billOf())),
    resume: jest.fn(() => ok(billOf())),
    end: jest.fn(() => ok(billOf())),
    skip: jest.fn(() => ok({} as never)),
    snooze: jest.fn(() => ok({} as never)),
    unmark: jest.fn(() => ok(undefined)),
    link: jest.fn(() => ok({} as never)),
    ...overrides,
  } as BillWrites;
}

const categories = new Map(BILL_CATEGORIES.map((category) => [category.id, category]));
const internet = billOf({ id: "bill-internet", name: "Internet", categoryId: "internet", amountCents: 169_900, rule: { kind: "monthly", day: 5 }, startsOn: "2026-07-01" });
const kuryente = billOf({ id: "bill-kuryente", name: "Kuryente", categoryId: "electricity", amountCents: null, rule: { kind: "monthly", day: 15 } });
const payments = [
  paymentOf({ billId: "bill-kuryente", dueOn: "2026-08-15", amountCents: 580_000 }),
  paymentOf({ billId: "bill-kuryente", dueOn: "2026-09-15", amountCents: 640_000 }),
];

function rowFor(billId: string) {
  const view = buildBillsView({ bills: [internet, kuryente], payments, marks: [], today: BILL_TODAY });
  return findBillRow(view, billId)!;
}

function renderSheet(billId: string, writes = fakeWrites(), handlers: Partial<Record<"onPay" | "onEdit" | "onDone" | "onClose", jest.Mock>> = {}) {
  const props = { onPay: jest.fn(), onEdit: jest.fn(), onDone: jest.fn(), onClose: jest.fn(), ...handlers };
  const row = rowFor(billId);
  render(
    <BillSheet
      row={row}
      category={categories.get(row.bill.categoryId) ?? null}
      categories={categories}
      payments={payments}
      today={BILL_TODAY}
      historyFrom="2026-06-24"
      writes={writes}
      onOpenExpense={jest.fn()}
      {...props}
    />,
  );
  return { ...props, writes };
}

function pressBack() {
  const { Modal: NativeModal } = jest.requireActual("react-native") as typeof import("react-native");
  act(() => screen.UNSAFE_getByType(NativeModal).props.onRequestClose());
}

beforeEach(() => jest.clearAllMocks());

it("leads with the due line, the amount and Mark paid, which pays the OLDEST missed month", () => {
  const { onPay } = renderSheet("bill-internet");
  expect(screen.getByText("Due Mon 5 Oct · every month on the 5th")).toBeTruthy();
  expect(screen.getByText("₱1,699")).toBeTruthy();
  expect(screen.getByText("3 months not marked. This marks the oldest one, due Wed 5 Aug.")).toBeTruthy();

  fireEvent.press(screen.getByTestId("bill-mark-paid"));

  expect(onPay).toHaveBeenCalledWith(expect.objectContaining({ billId: "bill-internet", dueOn: "2026-08-05", amountCents: 169_900 }));
});

it("shows a changing bill's estimate and its last payments", () => {
  renderSheet("bill-kuryente");
  expect(screen.getByText("about ₱6,100")).toBeTruthy();
  expect(screen.getByText("Last 2: ₱6,400 · ₱5,800")).toBeTruthy();
});

it("Nothing to pay this time skips that due date and offers Undo", async () => {
  const { writes, onDone } = renderSheet("bill-kuryente");
  await act(async () => fireEvent.press(screen.getByTestId("bill-skip")));
  expect(writes.skip).toHaveBeenCalledWith("bill-kuryente", "2026-10-15");
  expect(onDone).toHaveBeenCalledWith({
    message: "Kuryente: nothing to pay this time",
    undo: { billId: "bill-kuryente", dueOn: "2026-10-15" },
  });
});

it("Remind me tomorrow snoozes until tomorrow", async () => {
  const { writes, onDone } = renderSheet("bill-kuryente");
  await act(async () => fireEvent.press(screen.getByTestId("bill-snooze")));
  expect(writes.snooze).toHaveBeenCalledWith("bill-kuryente", "2026-10-15", "2026-10-23");
  expect(onDone).toHaveBeenCalledWith({ message: "We'll remind you about Kuryente tomorrow" });
});

it("I already recorded it lists nearby expenses in place and links the one tapped", async () => {
  jest.mocked(useLinkableExpenses).mockReturnValue({
    expenses: [homeExpense({ id: "e9", categoryId: "electricity", amountCents: 612_000, spentOn: "2026-10-14", note: "Meralco" })],
    isLoading: false,
    error: null,
    retry: jest.fn(),
  });
  const { writes, onDone } = renderSheet("bill-kuryente");
  fireEvent.press(screen.getByTestId("bill-link"));
  expect(screen.getByText("Which expense paid the one due Thu 15 Oct?")).toBeTruthy();

  await act(async () => fireEvent.press(screen.getByTestId("bill-link-e9")));

  expect(writes.link).toHaveBeenCalledWith("e9", "bill-kuryente", "2026-10-15");
  expect(onDone).toHaveBeenCalledWith({ message: "Kuryente marked paid with ₱6,120" });
});

it("says so plainly when nothing could be the payment", () => {
  jest.mocked(useLinkableExpenses).mockReturnValue({ expenses: [], isLoading: false, error: null, retry: jest.fn() });
  renderSheet("bill-kuryente");
  fireEvent.press(screen.getByTestId("bill-link"));
  expect(screen.getByText("No Kuryente expense within 10 days of Thu 15 Oct. Use Mark paid to record it.")).toBeTruthy();
});

it("stopping asks first and says past payments stay", async () => {
  const { writes, onDone } = renderSheet("bill-kuryente");
  fireEvent.press(screen.getByTestId("bill-manage"));
  fireEvent.press(screen.getByTestId("bill-stop"));
  expect(screen.getByText("Every past payment stays in Expenses. It just stops reminding you.")).toBeTruthy();
  expect(writes.end).not.toHaveBeenCalled();

  await act(async () => fireEvent.press(screen.getByTestId("bill-stop-confirm")));

  expect(writes.end).toHaveBeenCalledWith("bill-kuryente");
  expect(onDone).toHaveBeenCalledWith({ message: "Kuryente is stopped" });
});

it("pauses until a chosen day", async () => {
  const { writes } = renderSheet("bill-kuryente");
  fireEvent.press(screen.getByTestId("bill-manage"));
  fireEvent.press(screen.getByTestId("bill-pause"));
  await act(async () => fireEvent.press(screen.getByTestId("bill-pause-next")));
  expect(writes.pause).toHaveBeenCalledWith("bill-kuryente", "2026-11-01");
});

it("shows a refusal in words and stays open", async () => {
  const writes = fakeWrites({ skip: jest.fn(() => Promise.resolve({ ok: false as const, message: "No connection. Try again when you're back online." })) });
  const { onDone } = renderSheet("bill-kuryente", writes);
  await act(async () => fireEvent.press(screen.getByTestId("bill-skip")));
  expect(screen.getByText("No connection. Try again when you're back online.")).toBeTruthy();
  expect(onDone).not.toHaveBeenCalled();
});

it("Android back steps out of an inner step before closing", () => {
  const { onClose } = renderSheet("bill-kuryente");
  fireEvent.press(screen.getByTestId("bill-manage"));
  fireEvent.press(screen.getByTestId("bill-stop"));

  pressBack();
  expect(screen.getByTestId("bill-edit")).toBeTruthy();
  pressBack();
  expect(screen.getByTestId("bill-mark-paid")).toBeTruthy();
  expect(onClose).not.toHaveBeenCalled();
  pressBack();
  expect(onClose).toHaveBeenCalledTimes(1);
});
