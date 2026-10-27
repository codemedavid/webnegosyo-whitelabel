import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { REMITTANCE_COPY, parseRemittance, type Remittance } from "../../lib/cash/remittances";
import type { CashDb } from "../../lib/cash/settings";
import { AcceptRemittanceSheet, type SheetResult } from "./AcceptRemittanceSheet";
import { ForceCloseShiftSheet } from "./ForceCloseShiftSheet";
import { RemittanceDetailSheet } from "./RemittanceDetailSheet";

jest.mock("../../lib/cash/use-cash-rules", () => ({ liveCashDb: {} }));

const remittance: Remittance = parseRemittance({
  id: "r1",
  kind: "shift",
  status: "pending",
  cashier_user_id: "ana",
  cashier_name: "Ana Reyes",
  handed_over_cents: 634500,
  remitted_to_name: "Maria Santos",
  business_day: "2026-10-24",
  created_at: "2026-10-24T18:51:00.000Z",
  shift: { drawer_name: "Cashier 1", opened_at: "2026-10-24T10:02:00.000Z", closed_at: "2026-10-24T18:48:00.000Z", closing_count: 8345, expected_cash: 8465, variance_reason: "wrong_change" },
});

const ok = async (): Promise<SheetResult> => ({ ok: true });

function renderAccept(overrides: Partial<React.ComponentProps<typeof AcceptRemittanceSheet>> = {}) {
  const onAccept = jest.fn(ok);
  const onDispute = jest.fn(ok);
  render(
    <AcceptRemittanceSheet remittance={remittance} isOffline={false} onAccept={onAccept} onDispute={onDispute} onClose={jest.fn()} {...overrides} />,
  );
  return { onAccept, onDispute };
}

describe("AcceptRemittanceSheet", () => {
  it("asks the one question and accepts the slip amount in one tap", async () => {
    const { onAccept } = renderAccept();
    expect(screen.getByText("Did you receive ₱6,345 from Ana?")).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Yes, I received ₱6,345" })));
    expect(onAccept).toHaveBeenCalledWith(634500, null);
  });

  it("a different amount says the gap and needs a note", async () => {
    const { onAccept } = renderAccept();
    fireEvent.press(screen.getByRole("button", { name: "I got a different amount" }));
    fireEvent.changeText(screen.getByLabelText("Amount you received in pesos"), "6300");
    expect(screen.getByText("₱6,300 received. ₱45 less than the slip.")).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Accept ₱6,300" })));
    expect(screen.getByText(REMITTANCE_COPY.noteRequired)).toBeTruthy();
    expect(onAccept).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByLabelText("Note"), "Envelope short");
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Accept ₱6,300" })));
    expect(onAccept).toHaveBeenCalledWith(630000, "Envelope short");
  });

  it("reports a problem with a reason", async () => {
    const { onDispute } = renderAccept();
    fireEvent.press(screen.getByRole("button", { name: "Report a problem" }));
    fireEvent.changeText(screen.getByLabelText("What went wrong"), "Envelope missing");
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Report problem" })));
    expect(onDispute).toHaveBeenCalledWith("Envelope missing", null);
  });

  it("a forced close goes straight to counting (no slip amount to agree with)", () => {
    renderAccept({ remittance: { ...remittance, handedOverCents: null } });
    expect(screen.getByText("Count Ana's cash")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Yes, I received/ })).toBeNull();
  });

  it("offline, accepting is disabled and says why", () => {
    renderAccept({ isOffline: true });
    expect(screen.getByText(REMITTANCE_COPY.offlineAccept)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Yes, I received ₱6,345" }).props.accessibilityState.disabled).toBe(true);
  });

  it("keeps a server refusal on the sheet", async () => {
    renderAccept({ onAccept: jest.fn(async (): Promise<SheetResult> => ({ ok: false, error: REMITTANCE_COPY.notPending })) });
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Yes, I received ₱6,345" })));
    expect(screen.getByText(REMITTANCE_COPY.notPending)).toBeTruthy();
  });
});

describe("RemittanceDetailSheet", () => {
  const actions = { canAccept: false, canDispute: false, canResolve: true };

  it("shows the count it came from, with the reason, never ₱0 for unknowns", () => {
    render(
      <RemittanceDetailSheet
        remittance={{ ...remittance, shift: { ...remittance.shift!, expectedCents: null } }}
        actions={{ canAccept: true, canDispute: true, canResolve: false }}
        isOffline={false}
        onAccept={jest.fn()}
        onResolve={jest.fn(ok)}
        onOpenSlip={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByText("Not known")).toBeTruthy();
    expect(screen.getByText("Wrong sukli (change)")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Accept" })).toBeTruthy();
  });

  it("settles a disputed one with a note", async () => {
    const onResolve = jest.fn(ok);
    render(
      <RemittanceDetailSheet
        remittance={{ ...remittance, status: "disputed", disputeReason: "Envelope short", receivedByName: "Maria" }}
        actions={actions}
        isOffline={false}
        onAccept={jest.fn()}
        onResolve={onResolve}
        onOpenSlip={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByText("Problem reported by Maria: Envelope short")).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Mark settled" })));
    expect(screen.getByText(REMITTANCE_COPY.resolveNoteRequired)).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText("How it was settled"), "Found it in the safe");
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Mark settled" })));
    expect(onResolve).toHaveBeenCalledWith("Found it in the safe");
  });
});

describe("ForceCloseShiftSheet", () => {
  const shift = { id: "s2", staffName: "Ben Cruz", drawerName: "Cashier 2", openedAt: "2026-10-24T10:00:00.000Z" };
  const nowMs = Date.parse("2026-10-24T21:00:00.000Z");

  it("ends someone else's shift without inventing a count", async () => {
    const rpc = jest.fn(async () => ({ data: { closedAt: "2026-10-24T21:00:00.000Z", remittanceId: "r9" }, error: null }));
    const db = { from: jest.fn(), rpc } as unknown as CashDb;
    const onDone = jest.fn();
    render(<ForceCloseShiftSheet shift={shift} isOffline={false} nowMs={nowMs} onDone={onDone} onClose={jest.fn()} db={db} />);
    expect(screen.getByText("End Ben's shift?")).toBeTruthy();
    expect(screen.getByText("Open on Cashier 2 for 11h")).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText("Note"), "Went home sick");
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "End Ben's shift" })));
    expect(rpc).toHaveBeenCalledWith("force_close_shift", { p_shift_id: "s2", p_note: "Went home sick" });
    expect(onDone).toHaveBeenCalledWith({ closedAt: "2026-10-24T21:00:00.000Z", remittanceId: "r9" });
  });

  it("shows a refusal and stays open", async () => {
    const db = { from: jest.fn(), rpc: jest.fn(async () => ({ data: null, error: null })) } as unknown as CashDb;
    const onDone = jest.fn();
    render(<ForceCloseShiftSheet shift={shift} isOffline={false} nowMs={nowMs} onDone={onDone} onClose={jest.fn()} db={db} />);
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "End Ben's shift" })));
    expect(screen.getByText(REMITTANCE_COPY.forceCloseRefused)).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("is disabled offline", () => {
    render(<ForceCloseShiftSheet shift={shift} isOffline nowMs={nowMs} onDone={jest.fn()} onClose={jest.fn()} />);
    expect(screen.getByRole("button", { name: "End Ben's shift" }).props.accessibilityState.disabled).toBe(true);
  });
});
