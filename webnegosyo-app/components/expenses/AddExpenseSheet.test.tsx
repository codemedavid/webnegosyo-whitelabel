import React, { useState } from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import { AddExpenseSheet, UNDO_WINDOW_MS } from "./AddExpenseSheet";
import { ExpenseUndoHost } from "./ExpenseUndoHost";
import { expenseUndoStore } from "../../stores/expense-undo-store";
import { commitQueuedExpense, pendingExpenses, queueExpense, undoExpense } from "../../lib/expenses/live-expense-queue";
import type { AddExpenseMode } from "../../lib/expenses/add-expense-form";
import type { ExpenseCategory } from "../../lib/expenses/types";

const mockSession = { isDemo: false };
jest.mock("../../stores/auth-store", () => ({
  useAuthStore: Object.assign((select: (state: typeof mockSession) => unknown) => select(mockSession), { getState: () => mockSession }),
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("@react-native-community/datetimepicker", () => ({ __esModule: true, default: () => null }));
jest.mock("../../lib/expenses/actor-name", () => ({ readActorName: jest.fn(async () => "Ana") }));
jest.mock("../../lib/expenses/receipt-files", () => ({ captureReceipt: jest.fn(), describeCaptureOutcome: jest.fn() }));
jest.mock("../../lib/expenses/live-expense-queue", () => ({
  queueExpense: jest.fn(async (entry: { payload: unknown }) => ({ id: "kept", ...entry })),
  queueReceipt: jest.fn(async () => {}),
  pendingExpenses: jest.fn(async () => []),
  commitQueuedExpense: jest.fn(async () => ({ sent: new Map([["x", "srv"]]), waiting: 0, refused: 0 })),
  undoExpense: jest.fn(async () => ({ status: "undone" })),
}));

function category(id: string, name: string, group: ExpenseCategory["group"], sortOrder: number, needsNote = false): ExpenseCategory {
  return { id, tenantId: "t1", systemKey: id, name, icon: name.slice(0, 2).toUpperCase(), group, needsNote, sortOrder, archivedAt: null };
}
const mockCategories = [
  category("lpg", "Gas / LPG", "utilities", 10),
  category("ice", "Ice (Yelo)", "ingredients", 20),
  category("other", "Other", "other", 30, true),
  category("owner_draw", "Owner took cash", "not_expense", 40),
  ...Array.from({ length: 8 }, (_, index) => category(`extra-${index}`, `Extra ${index}`, "operating", 50 + index)),
];
const mockInvalidate = jest.fn(async () => {});
jest.mock("../../lib/expenses/use-expenses", () => ({
  useExpenseTenant: () => "t1",
  useExpenseOutlet: () => null,
  useInvalidateExpenses: () => mockInvalidate,
  useExpenseCategories: () => ({ categories: mockCategories, isLoading: false, error: null }),
  useRecentExpenses: () => ({ expenses: [] }),
  useTracksStock: () => false,
}));

const drawerMode = { kind: "drawer" as const, shiftId: "shift-1", drawerName: "Cashier 1", availableCents: 150_000 };
const bookMode: AddExpenseMode = { kind: "book" };

type Screen = ReturnType<typeof render>;

function typeAmount(screen: Screen, keys: string[]) {
  for (const key of keys) fireEvent.press(screen.getByTestId(`keypad-${key}`));
}

function requestIdOf(call: unknown[]): string {
  const entry = call[0] as { payload: { kind: string; draft?: { clientRequestId: string }; input?: { clientRequestId: string } } };
  return entry.payload.draft?.clientRequestId ?? entry.payload.input?.clientRequestId ?? "";
}

/** The sheet as a screen opens it, with the layout's undo host beside it. */
function Screenful({ mode, onClose, onCommitted }: { mode: AddExpenseMode; onClose: () => void; onCommitted?: () => void }) {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <>
      <AddExpenseSheet
        visible={isOpen}
        mode={mode}
        onCommitted={onCommitted}
        onClose={() => {
          onClose();
          setIsOpen(false);
        }}
      />
      <ExpenseUndoHost />
    </>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockSession.isDemo = false;
});
afterEach(() => {
  const current = expenseUndoStore.getState().current;
  if (current) expenseUndoStore.getState().commit(current.id);
  jest.useRealTimers();
});

it("is amount first: Pay stays off until there is an amount and a category, and always shows the amount", () => {
  const screen = render(<AddExpenseSheet visible mode={drawerMode} onClose={jest.fn()} />);
  expect(screen.getByText("Pay from the drawer")).toBeTruthy();
  expect(screen.getByText("Cashier 1 drawer")).toBeTruthy();

  typeAmount(screen, ["1", "2", "5", "0"]);
  expect(screen.getByText("Pay ₱1,250 from drawer")).toBeTruthy();
  expect(screen.getByTestId("expense-save").props.accessibilityState).toMatchObject({ disabled: true });

  fireEvent.press(screen.getByLabelText("Gas / LPG"));
  expect(screen.getByTestId("expense-save").props.accessibilityState).toMatchObject({ disabled: false });
  expect(screen.getByLabelText("Amount: 1,250 pesos")).toBeTruthy();
  expect(screen.getByText("After this the drawer should hold ₱250")).toBeTruthy();
});

it("drawer mode has no paid-from row, no date and no Save + next", () => {
  const screen = render(<AddExpenseSheet visible mode={drawerMode} onClose={jest.fn()} />);
  expect(screen.queryByLabelText("Paid from GCash")).toBeNull();
  expect(screen.queryByTestId("expense-extra-date")).toBeNull();
  expect(screen.queryByTestId("expense-extra-paidTo")).toBeNull();
  expect(screen.queryByTestId("expense-save-next")).toBeNull();
  expect(screen.getByTestId("expense-extra-photo")).toBeTruthy();
  expect(screen.getByTestId("expense-extra-note")).toBeTruthy();
});

it("Save closes the sheet; the host keeps the Undo window and then sends it", async () => {
  const onClose = jest.fn();
  const onCommitted = jest.fn();
  const screen = render(<Screenful mode={drawerMode} onClose={onClose} onCommitted={onCommitted} />);
  typeAmount(screen, ["1", "2", "5", "0"]);
  fireEvent.press(screen.getByLabelText("Gas / LPG"));
  fireEvent.press(screen.getByTestId("expense-save"));

  await waitFor(() => expect(onClose).toHaveBeenCalled());
  const [entry, hold] = jest.mocked(queueExpense).mock.calls[0];
  expect(hold).toBe(UNDO_WINDOW_MS);
  expect(entry.payload).toEqual({
    kind: "drawer",
    input: expect.objectContaining({ shiftId: "shift-1", amountCents: 125_000, categoryId: "lpg", recordedByName: "Ana" }),
  });
  expect(screen.queryByText("Pay from the drawer")).toBeNull();
  expect(screen.getByText("Saved · Gas / LPG ₱1,250")).toBeTruthy();
  expect(commitQueuedExpense).not.toHaveBeenCalled();

  await act(async () => {
    jest.advanceTimersByTime(UNDO_WINDOW_MS);
  });
  await waitFor(() => expect(commitQueuedExpense).toHaveBeenCalledWith("t1", requestIdOf(jest.mocked(queueExpense).mock.calls[0])));
  expect(commitQueuedExpense).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(onCommitted).toHaveBeenCalled());
  expect(mockInvalidate).toHaveBeenCalled();
  expect(screen.queryByText("Saved · Gas / LPG ₱1,250")).toBeNull();
});

it("Undo on the host forgets the entry instead of sending it", async () => {
  const screen = render(<Screenful mode={bookMode} onClose={jest.fn()} />);
  typeAmount(screen, ["8", "0"]);
  fireEvent.press(screen.getByLabelText("Ice (Yelo)"));
  fireEvent.press(screen.getByTestId("expense-save"));
  await waitFor(() => expect(screen.getByText("Undo")).toBeTruthy());

  fireEvent.press(screen.getByText("Undo"));

  await waitFor(() => expect(undoExpense).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "t1", actorName: "Ana" })));
  await act(async () => {
    jest.advanceTimersByTime(UNDO_WINDOW_MS);
  });
  expect(commitQueuedExpense).not.toHaveBeenCalled();
});

it("Save + next keeps the sheet open for the next entry, keeping where the money came from", async () => {
  const onClose = jest.fn();
  const screen = render(<AddExpenseSheet visible mode={bookMode} onClose={onClose} />);
  fireEvent.press(screen.getByLabelText("Paid from GCash"));
  typeAmount(screen, ["8", "0"]);
  fireEvent.press(screen.getByLabelText("Ice (Yelo)"));
  fireEvent.press(screen.getByTestId("expense-save-next"));

  await waitFor(() => expect(screen.getByText("Saved · Ice ₱80")).toBeTruthy());
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByText("New expense")).toBeTruthy();
  expect(screen.getByLabelText("Amount: 0 pesos")).toBeTruthy();
  expect(screen.getByLabelText("Paid from GCash").props.accessibilityState).toMatchObject({ selected: true });
  const [entry] = jest.mocked(queueExpense).mock.calls[0];
  expect(entry.payload).toMatchObject({ kind: "book", draft: { paidFrom: "gcash", amountCents: 8_000, categoryId: "ice" } });

  // A second save inside the window sends the first now; each is sent once.
  typeAmount(screen, ["5", "0"]);
  fireEvent.press(screen.getByLabelText("Gas / LPG"));
  fireEvent.press(screen.getByTestId("expense-save-next"));
  await waitFor(() => expect(screen.getByText("Saved · Gas / LPG ₱50")).toBeTruthy());
  expect(commitQueuedExpense).toHaveBeenCalledTimes(1);
  await act(async () => {
    jest.advanceTimersByTime(UNDO_WINDOW_MS);
  });
  expect(commitQueuedExpense).toHaveBeenCalledTimes(2);
});

it("says the entry is saved on this phone when older ones are still waiting", async () => {
  jest.mocked(pendingExpenses).mockResolvedValueOnce([
    { id: "older", tenantId: "t1", payload: { kind: "drawer", input: { shiftId: "s", amountCents: 1, categoryId: "lpg", note: null, paidToName: null, clientRequestId: "older" } }, categoryName: "Gas / LPG", attempts: 2, retryAt: null, createdAt: 0, refusedReason: null },
  ] as never);
  const screen = render(<AddExpenseSheet visible mode={bookMode} onClose={jest.fn()} />);
  typeAmount(screen, ["8", "0"]);
  fireEvent.press(screen.getByLabelText("Ice (Yelo)"));
  fireEvent.press(screen.getByTestId("expense-save-next"));
  expect(await screen.findByText("Saved on this phone · Ice ₱80")).toBeTruthy();
});

it("opens with the caller's amount, note and category, and again with new ones when reopened", () => {
  const props = { mode: bookMode, onClose: jest.fn() };
  const screen = render(<AddExpenseSheet visible {...props} initialAmountCents={213_050} initialNote="Delivery" initialCategoryId="ice" />);
  expect(screen.getByText("Save ₱2,130.50")).toBeTruthy();
  expect(screen.getByText("Note added")).toBeTruthy();
  expect(screen.getByLabelText("Ice (Yelo)").props.accessibilityState).toMatchObject({ selected: true });

  typeAmount(screen, ["backspace"]);
  screen.rerender(<AddExpenseSheet visible={false} {...props} initialAmountCents={213_050} initialNote="Delivery" initialCategoryId="ice" />);
  screen.rerender(<AddExpenseSheet visible {...props} initialAmountCents={50_000} initialCategoryId="lpg" />);
  expect(screen.getByText("Save ₱500")).toBeTruthy();
  expect(screen.getByText("Note")).toBeTruthy();
  expect(screen.getByLabelText("Gas / LPG").props.accessibilityState).toMatchObject({ selected: true });
});

it("pre-picks a category from the note, but never over the person's own pick", () => {
  const screen = render(<AddExpenseSheet visible mode={bookMode} onClose={jest.fn()} />);
  fireEvent.press(screen.getByTestId("expense-extra-note"));
  fireEvent.changeText(screen.getByLabelText("Note"), "yelo");
  expect(screen.getByLabelText("Ice (Yelo)").props.accessibilityState).toMatchObject({ selected: true });

  fireEvent.press(screen.getByLabelText("Other"));
  fireEvent.changeText(screen.getByLabelText("Note"), "gasul");
  expect(screen.getByLabelText("Other").props.accessibilityState).toMatchObject({ selected: true });
});

it("shows every spendable category in place, never the cash-taken-out kinds", () => {
  const screen = render(<AddExpenseSheet visible mode={bookMode} onClose={jest.fn()} />);
  fireEvent.press(screen.getByTestId("category-all"));
  expect(screen.getByText("All categories")).toBeTruthy();
  expect(screen.getByTestId("category-row-extra-7")).toBeTruthy();
  expect(screen.queryByTestId("category-row-owner_draw")).toBeNull();

  fireEvent.press(screen.getByTestId("category-row-extra-7"));
  expect(screen.queryByText("All categories")).toBeNull();
  expect(screen.getByLabelText("Extra 7").props.accessibilityState).toMatchObject({ selected: true });
});

it("refuses more than the drawer should hold, in the drawer's words", async () => {
  const screen = render(<AddExpenseSheet visible mode={drawerMode} onClose={jest.fn()} />);
  typeAmount(screen, ["2", "0", "0", "0"]);
  fireEvent.press(screen.getByLabelText("Gas / LPG"));
  fireEvent.press(screen.getByTestId("expense-save"));

  expect(await screen.findByText("That is more than this drawer should be holding. Count it first.")).toBeTruthy();
  expect(queueExpense).not.toHaveBeenCalled();
});

it("asks for a note when the category needs one", async () => {
  const screen = render(<AddExpenseSheet visible mode={bookMode} onClose={jest.fn()} />);
  typeAmount(screen, ["5", "00"]);
  fireEvent.press(screen.getByLabelText("Other"));
  fireEvent.press(screen.getByTestId("expense-save"));

  expect(await screen.findByText("Add a note for this category.")).toBeTruthy();
  expect(screen.getByLabelText("Note")).toBeTruthy();
  expect(queueExpense).not.toHaveBeenCalled();
});

it("offers only the not-an-expense kinds when taking cash out", () => {
  const screen = render(<AddExpenseSheet visible mode={drawerMode} scope="take_out" onClose={jest.fn()} />);
  expect(screen.getByText("Take out cash")).toBeTruthy();
  expect(screen.getByLabelText("Owner took cash")).toBeTruthy();
  expect(screen.queryByLabelText("Gas / LPG")).toBeNull();
  typeAmount(screen, ["5", "0", "0"]);
  expect(screen.getByText("Take out ₱500")).toBeTruthy();
});

it("records nothing in demo mode", async () => {
  mockSession.isDemo = true;
  const screen = render(<AddExpenseSheet visible mode={bookMode} onClose={jest.fn()} />);
  typeAmount(screen, ["8", "0"]);
  fireEvent.press(screen.getByLabelText("Ice (Yelo)"));
  fireEvent.press(screen.getByTestId("expense-save"));
  await act(async () => {});
  expect(queueExpense).not.toHaveBeenCalled();
});
