import React from "react";
import { AccessibilityInfo } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { approvalRequest } from "../../lib/approvals/test-fixtures";
import { DeclineSheet } from "./DeclineSheet";
import { ReviewDock } from "./ReviewDock";

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, "isScreenReaderEnabled").mockResolvedValue(false);
});
afterEach(() => jest.restoreAllMocks());

function renderDock(dock: React.ComponentProps<typeof ReviewDock>["dock"], extra: Partial<React.ComponentProps<typeof ReviewDock>> = {}) {
  const handlers = { onApprove: jest.fn(), onDecline: jest.fn(), onChangeAmount: jest.fn(), onDone: jest.fn() };
  render(<ReviewDock request={approvalRequest()} dock={dock} approveAmount={185} isDeciding={false} error={null} {...handlers} {...extra} />);
  return handlers;
}

describe("ReviewDock", () => {
  it("offers the slide named by the amount, Decline and Change amount apart", async () => {
    const handlers = renderDock({ kind: "decide" });
    const slide = await screen.findByRole("button", { name: "Approve 185 pesos" });
    fireEvent(slide, "accessibilityAction", { nativeEvent: { actionName: "activate" } });
    expect(handlers.onApprove).toHaveBeenCalled();
    fireEvent.press(screen.getByRole("button", { name: "Decline…" }));
    expect(handlers.onDecline).toHaveBeenCalled();
    fireEvent.press(screen.getByRole("button", { name: "Change amount" }));
    expect(handlers.onChangeAmount).toHaveBeenCalled();
  });

  it("an approved-for-less amount renames the slide", async () => {
    renderDock({ kind: "decide" }, { approveAmount: 150 });
    expect(await screen.findByRole("button", { name: "Approve 150 pesos" })).toBeTruthy();
  });

  it("read-only over the limit, with no slide", () => {
    renderDock({ kind: "waiting", title: "Waiting for the owner", text: "Over your ₱1,000 limit. The owner has been asked." });
    expect(screen.getByText("Over your ₱1,000 limit. The owner has been asked.")).toBeTruthy();
    expect(screen.queryByText("Slide to approve ₱185")).toBeNull();
  });

  it("offline disables deciding with the reason", () => {
    renderDock({ kind: "offline", text: "You're offline. Connect to approve." });
    expect(screen.getByText("You're offline. Connect to approve.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Decline…" })).toBeNull();
  });

  it("a result shows the R-number and closes on Done", () => {
    const handlers = renderDock({ kind: "done", tone: "success", text: "Approved. Ana can give back ₱185 now.", detail: "R-0042" });
    expect(screen.getByText("R-0042")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Done" }));
    expect(handlers.onDone).toHaveBeenCalled();
  });
});

describe("DeclineSheet", () => {
  it("needs a reason, which is sent with the note", () => {
    const onConfirm = jest.fn();
    render(<DeclineSheet visible requesterFirstName="Ana" isBusy={false} error={null} onConfirm={onConfirm} onClose={jest.fn()} />);
    expect(screen.getByText("Pick a reason first")).toBeTruthy();
    fireEvent.press(screen.getByRole("radio", { name: "Reason Offer a replacement instead" }));
    fireEvent.changeText(screen.getByLabelText("Tell Ana what to do next (optional)"), "Give her a fresh one");
    fireEvent.press(screen.getByRole("button", { name: "Decline and tell Ana" }));
    expect(onConfirm).toHaveBeenCalledWith({ reasonCode: "offer_replacement", note: "Give her a fresh one" });
  });
});
