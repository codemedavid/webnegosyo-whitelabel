/**
 * The receiver's side of a remittance (06 §4.4, W2.2 accept/dispute). What is
 * pinned: one tap accepts exactly the slip's amount; a different amount needs
 * a note (the database refuses one without), and the sheet says how far off
 * it is; a forced close (nobody counted) asks for the receiver's own count;
 * offline, nothing can be accepted; a dispute needs a reason.
 */
import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { AcceptRemitBody } from "./AcceptRemitBody";
import { OFFLINE_LINE, differenceLine, validateAccept, validateDispute } from "./accept-remit";

describe("accept-remit rules", () => {
  it("differenceLine says how far the received amount is from the slip", () => {
    expect(differenceLine(634500, 630000)).toBe("₱6,300 received. ₱45 less than the slip.");
    expect(differenceLine(634500, 640000)).toBe("₱6,400 received. ₱55 more than the slip.");
    expect(differenceLine(634500, 634500)).toBeNull();
    expect(differenceLine(null, 5000)).toBeNull();
  });

  it("validateAccept: an amount is needed; a different one needs a note", () => {
    expect(validateAccept(634500, null, "")).toEqual({ ok: false, message: "Type what you received." });
    expect(validateAccept(634500, 630000, "  ")).toEqual({ ok: false, message: "Add a note: what was different?" });
    expect(validateAccept(634500, 630000, "₱45 in coins missing")).toEqual({ ok: true, receivedCents: 630000, note: "₱45 in coins missing" });
    expect(validateAccept(634500, 634500, "")).toEqual({ ok: true, receivedCents: 634500, note: null });
    expect(validateAccept(null, 500000, "")).toEqual({ ok: true, receivedCents: 500000, note: null });
  });

  it("validateDispute needs a reason", () => {
    expect(validateDispute(" ")).toEqual({ ok: false, message: "Say what's wrong, for example \"envelope short\"." });
    expect(validateDispute("envelope missing")).toEqual({ ok: true, reason: "envelope missing", receivedCents: null });
    expect(validateDispute("envelope short", "6,000")).toEqual({ ok: true, reason: "envelope short", receivedCents: 600000 });
    expect(validateDispute("envelope short", "abc")).toEqual({ ok: false, message: "Type an amount like 4,150" });
  });
});

describe("AcceptRemitBody", () => {
  it("Yes accepts exactly the slip amount", () => {
    const onAccept = jest.fn();
    const { getByText, getByTestId } = render(<AcceptRemitBody cashierName="Ana" handedOverCents={634500} onAccept={onAccept} />);
    expect(getByText("Did you receive ₱6,345 from Ana?")).toBeTruthy();
    fireEvent.press(getByTestId("accept-yes"));
    expect(onAccept).toHaveBeenCalledWith({ receivedCents: 634500, note: null });
  });

  it("a different amount: typed on the keypad, the gap shown, a note required", () => {
    const onAccept = jest.fn();
    const { getByTestId, getByText, queryByText } = render(<AcceptRemitBody cashierName="Ana" handedOverCents={634500} onAccept={onAccept} />);
    fireEvent.press(getByTestId("accept-different"));
    for (const key of ["6", "3", "0", "0"]) fireEvent.press(getByTestId(`accept-key-${key}`));
    expect(getByText("₱6,300 received. ₱45 less than the slip.")).toBeTruthy();
    fireEvent.press(getByTestId("accept-confirm-different"));
    expect(onAccept).not.toHaveBeenCalled();
    expect(getByText("Add a note: what was different?")).toBeTruthy();
    fireEvent.changeText(getByTestId("accept-note"), "coins short");
    expect(queryByText("Add a note: what was different?")).toBeNull();
    fireEvent.press(getByTestId("accept-confirm-different"));
    expect(onAccept).toHaveBeenCalledWith({ receivedCents: 630000, note: "coins short" });
  });

  it("a forced close asks the receiver to count; no Yes button", () => {
    const onAccept = jest.fn();
    const { getByText, queryByTestId, getByTestId } = render(<AcceptRemitBody cashierName="Ben" handedOverCents={null} onAccept={onAccept} />);
    expect(getByText("Count what Ben handed over.")).toBeTruthy();
    expect(queryByTestId("accept-yes")).toBeNull();
    for (const key of ["5", "0", "0", "0"]) fireEvent.press(getByTestId(`accept-key-${key}`));
    fireEvent.press(getByTestId("accept-confirm-different"));
    expect(onAccept).toHaveBeenCalledWith({ receivedCents: 500000, note: null });
  });

  it("offline: nothing can be accepted, and it says why", () => {
    const onAccept = jest.fn();
    const { getByText, getByTestId } = render(<AcceptRemitBody cashierName="Ana" handedOverCents={634500} onAccept={onAccept} isOffline />);
    expect(getByText(OFFLINE_LINE)).toBeTruthy();
    fireEvent.press(getByTestId("accept-yes"));
    expect(onAccept).not.toHaveBeenCalled();
  });

  it("dispute: a reason is required", () => {
    const onDispute = jest.fn();
    const { getByTestId, getByText } = render(<AcceptRemitBody cashierName="Ana" handedOverCents={634500} onAccept={jest.fn()} onDispute={onDispute} />);
    fireEvent.press(getByTestId("accept-dispute"));
    fireEvent.press(getByTestId("accept-confirm-dispute"));
    expect(onDispute).not.toHaveBeenCalled();
    expect(getByText("Say what's wrong, for example \"envelope short\".")).toBeTruthy();
    fireEvent.changeText(getByTestId("accept-dispute-reason"), "envelope missing");
    fireEvent.press(getByTestId("accept-confirm-dispute"));
    expect(onDispute).toHaveBeenCalledWith({ reason: "envelope missing", receivedCents: null });
  });

  it("dispute: an optional amount received goes along (p_received_cents); a bad one is refused", () => {
    const onDispute = jest.fn();
    const { getByTestId, getByText } = render(<AcceptRemitBody cashierName="Ana" handedOverCents={634500} onAccept={jest.fn()} onDispute={onDispute} />);
    fireEvent.press(getByTestId("accept-dispute"));
    fireEvent.changeText(getByTestId("accept-dispute-reason"), "envelope short");
    fireEvent.changeText(getByTestId("accept-dispute-amount"), "6,0o0");
    fireEvent.press(getByTestId("accept-confirm-dispute"));
    expect(onDispute).not.toHaveBeenCalled();
    expect(getByText("Type an amount like 4,150")).toBeTruthy();
    fireEvent.changeText(getByTestId("accept-dispute-amount"), "6,000");
    fireEvent.press(getByTestId("accept-confirm-dispute"));
    expect(onDispute).toHaveBeenCalledWith({ reason: "envelope short", receivedCents: 600000 });
  });

  it("shows the caller's write error and blocks taps while busy", () => {
    const onAccept = jest.fn();
    const { getByText, getByTestId } = render(
      <AcceptRemitBody cashierName="Ana" handedOverCents={634500} onAccept={onAccept} isBusy error="Already accepted by Maria." />,
    );
    expect(getByText("Already accepted by Maria.")).toBeTruthy();
    fireEvent.press(getByTestId("accept-yes"));
    expect(onAccept).not.toHaveBeenCalled();
  });
});
