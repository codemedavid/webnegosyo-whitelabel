/**
 * The add / change bill sheet: presets to start, never an Ingredients
 * category, plain-word validation, the next three dates live, and edits that
 * keep an old bill's start.
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { BillEditorSheet, type BillEditorMode } from "./BillEditorSheet";
import type { BillWrites } from "./use-bill-writes";
import { EDIT_NOTE } from "../../../lib/expenses/bill-editor-form";
import { BILL_CATEGORIES, BILL_TODAY, billOf } from "../../../lib/expenses/bills-fixtures";
import { NO_PREFILL } from "../../../lib/expenses/bills-route";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const ok = <T,>(value: T) => Promise.resolve({ ok: true as const, value });

function fakeWrites(): BillWrites {
  return {
    isBusy: false,
    create: jest.fn(() => ok(billOf())),
    update: jest.fn(() => ok(billOf())),
    pause: jest.fn(),
    resume: jest.fn(),
    end: jest.fn(),
    skip: jest.fn(),
    snooze: jest.fn(),
    unmark: jest.fn(),
    link: jest.fn(),
  } as unknown as BillWrites;
}

function renderEditor(mode: BillEditorMode, writes = fakeWrites(), branches: { id: string; name: string }[] = []) {
  const onSaved = jest.fn();
  const onClose = jest.fn();
  render(
    <BillEditorSheet
      mode={mode}
      categories={BILL_CATEGORIES}
      branches={branches}
      defaultOutletId={null}
      payments={[]}
      today={BILL_TODAY}
      writes={writes}
      onSaved={onSaved}
      onClose={onClose}
    />,
  );
  return { writes, onSaved, onClose };
}

const newMode: BillEditorMode = { kind: "new", prefill: NO_PREFILL };

function typeAmount(keys: string[]) {
  for (const key of keys) fireEvent.press(screen.getByTestId(`keypad-${key}`));
}

it("starts from a preset: Rent fills the name, category, and how often", () => {
  renderEditor(newMode);
  fireEvent.press(screen.getByLabelText("Rent"));
  expect(screen.getByDisplayValue("Rent")).toBeTruthy();
  expect(screen.getByLabelText("Category: Rent (Upa). Change")).toBeTruthy();
  expect(screen.getByLabelText("Every month").props.accessibilityState).toMatchObject({ selected: true });
  expect(screen.getByLabelText("3 days before").props.accessibilityState).toMatchObject({ selected: true });
});

it("never offers an Ingredients category under Other", () => {
  renderEditor(newMode);
  fireEvent.press(screen.getByLabelText("Other bill: pick a category"));
  expect(screen.getByTestId("category-row-rent")).toBeTruthy();
  expect(screen.getByTestId("category-row-loan_payment")).toBeTruthy();
  expect(screen.queryByTestId("category-row-ice")).toBeNull();
  expect(screen.queryByTestId("category-row-palengke")).toBeNull();

  fireEvent.press(screen.getByTestId("category-row-loan_payment"));
  expect(screen.getByDisplayValue("Loan payment")).toBeTruthy();
});

it("says what is missing in plain words instead of saving", async () => {
  const { writes } = renderEditor(newMode);
  await act(async () => fireEvent.press(screen.getByTestId("bill-save")));
  expect(screen.getByTestId("bill-editor-error").props.children).toBe("Give the bill a name");

  fireEvent.press(screen.getByLabelText("Rent"));
  await act(async () => fireEvent.press(screen.getByTestId("bill-save")));
  expect(screen.getByTestId("bill-editor-error").props.children).toBe("Type the usual amount, or pick Changes every time");
  expect(writes.create).not.toHaveBeenCalled();
});

it("shows the next three dates live, and the short-month hint for day 31", () => {
  renderEditor(newMode);
  fireEvent.press(screen.getByLabelText("Rent"));
  fireEvent.press(screen.getByTestId("bill-day-24"));
  expect(screen.getByTestId("bill-next-dates").props.children).toBe("Sat 24 Oct · Tue 24 Nov · Thu 24 Dec");
  expect(screen.queryByText("In shorter months we remind you on the last day.")).toBeNull();

  fireEvent.press(screen.getByTestId("bill-day-31"));
  expect(screen.getByTestId("bill-next-dates").props.children).toBe("Sat 31 Oct · Mon 30 Nov · Thu 31 Dec");
  expect(screen.getByText("In shorter months we remind you on the last day.")).toBeTruthy();
});

it("saves a new bill through the service and hands it back", async () => {
  const { writes, onSaved } = renderEditor(newMode, fakeWrites(), [
    { id: "o1", name: "Cubao" },
    { id: "o2", name: "Marikina" },
  ]);
  fireEvent.press(screen.getByLabelText("Rent"));
  typeAmount(["1", "5", "0", "0", "0"]);
  fireEvent.press(screen.getByLabelText("Usually paid from Bank"));
  fireEvent.press(screen.getByLabelText("Cubao"));
  await act(async () => fireEvent.press(screen.getByTestId("bill-save")));

  expect(writes.create).toHaveBeenCalledWith(
    expect.objectContaining({
      name: "Rent",
      categoryId: "rent",
      amountCents: 1_500_000,
      rule: { kind: "monthly", day: 1 },
      paidFrom: "bank",
      outletId: "o1",
      startsOn: BILL_TODAY,
    }),
    BILL_TODAY,
  );
  expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: "bill-rent" }), true);
});

it("saves a changing bill without an amount", async () => {
  const { writes } = renderEditor(newMode);
  fireEvent.press(screen.getByLabelText("Kuryente"));
  expect(screen.queryByTestId("keypad-1")).toBeNull();
  await act(async () => fireEvent.press(screen.getByTestId("bill-save")));
  expect(writes.create).toHaveBeenCalledWith(expect.objectContaining({ amountCents: null, name: "Kuryente" }), BILL_TODAY);
});

it("edits an old bill, keeping its start, and says the change applies from the next due date", async () => {
  const old = billOf({ startsOn: "2024-01-01" });
  const { writes, onSaved } = renderEditor({ kind: "edit", bill: old });
  expect(screen.getByText("Change Rent")).toBeTruthy();
  expect(screen.getByText(EDIT_NOTE)).toBeTruthy();
  expect(EDIT_NOTE.startsWith("Changes apply from the next due date.")).toBe(true);
  expect(screen.queryByLabelText("Kuryente")).toBeNull();

  await act(async () => fireEvent.press(screen.getByTestId("bill-save")));

  expect(writes.update).toHaveBeenCalledWith("bill-rent", expect.objectContaining({ startsOn: "2024-01-01" }), BILL_TODAY);
  expect(onSaved).toHaveBeenCalledWith(expect.anything(), false);
});

it("Android back leaves the category list before closing", () => {
  const { onClose } = renderEditor(newMode);
  fireEvent.press(screen.getByLabelText("Other bill: pick a category"));
  const { Modal: NativeModal } = jest.requireActual("react-native") as typeof import("react-native");
  act(() => screen.UNSAFE_getByType(NativeModal).props.onRequestClose());
  expect(screen.getByTestId("bill-save")).toBeTruthy();
  expect(onClose).not.toHaveBeenCalled();
  act(() => screen.UNSAFE_getByType(NativeModal).props.onRequestClose());
  expect(onClose).toHaveBeenCalledTimes(1);
});
