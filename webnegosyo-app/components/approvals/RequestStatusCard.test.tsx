import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { approvalRequest, FIXTURE_NOW } from "../../lib/approvals/test-fixtures";
import type { ApprovalRequestView } from "../../lib/approvals/types";
import { RequestStatusCard } from "./RequestStatusCard";

const mine = (overrides: Partial<ApprovalRequestView> = {}) =>
  approvalRequest({ requestedBy: "u-ana", canDecide: false, canWithdraw: true, ...overrides });

function renderCard(request: ApprovalRequestView | null, extra: { isSending?: boolean } = {}) {
  const handlers = { onWithdraw: jest.fn(), onAskAgain: jest.fn(), onDismiss: jest.fn() };
  render(
    <RequestStatusCard
      request={request}
      approverNames={["Marco", "Lorna"]}
      now={FIXTURE_NOW}
      isSending={extra.isSending}
      isWithdrawing={false}
      {...handlers}
    />,
  );
  return handlers;
}

describe("RequestStatusCard", () => {
  it("sending", () => {
    renderCard(null, { isSending: true });
    expect(screen.getByText("Sending to Marco and Lorna…")).toBeTruthy();
  });

  it("waiting, with a two-step Withdraw", () => {
    const { onWithdraw } = renderCard(mine());
    expect(screen.getByText("Waiting for Marco or Lorna")).toBeTruthy();
    expect(screen.getByText("Asked 2 min ago · expires 12:58 PM")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Withdraw" }));
    expect(screen.getByText("Withdraw request?")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Keep waiting" }));
    expect(onWithdraw).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole("button", { name: "Withdraw" }));
    fireEvent.press(screen.getByRole("button", { name: "Withdraw request" }));
    expect(onWithdraw).toHaveBeenCalledWith("req-1");
  });

  it("approved and finishing", () => {
    renderCard(mine({ status: "executing", decidedByName: "Marco" }));
    expect(screen.getByText("Approved by Marco · finishing…")).toBeTruthy();
  });

  it("done, with the R-number and the cash instruction", () => {
    const { onDismiss } = renderCard(
      mine({ status: "executed", decidedByName: "Marco", refundLabel: "R-0042", result: { cashInvolved: true, refundLabel: "R-0042" } }),
    );
    expect(screen.getByText("Approved by Marco. Give ₱185 back from your drawer.")).toBeTruthy();
    expect(screen.getByText("R-0042")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Done" }));
    expect(onDismiss).toHaveBeenCalledWith("req-1");
  });

  it("declined, with the approver's reason and words", () => {
    renderCard(mine({ status: "declined", decidedByName: "Marco", decisionReasonCode: "offer_replacement", decisionNote: "Give her a fresh one" }));
    expect(screen.getByText("Marco said not this time")).toBeTruthy();
    expect(screen.getByText("Offer a replacement instead")).toBeTruthy();
    expect(screen.getByText("“Give her a fresh one”")).toBeTruthy();
  });

  it("expired, withdrawn and failed offer to ask again", () => {
    const expired = renderCard(mine({ status: "expired" }));
    expect(screen.getByText("No answer in 30 min. The request closed.")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Ask again" }));
    expect(expired.onAskAgain).toHaveBeenCalled();
  });

  it("withdrawn", () => {
    renderCard(mine({ status: "withdrawn" }));
    expect(screen.getByText("Request withdrawn")).toBeTruthy();
  });

  it("failed", () => {
    renderCard(mine({ status: "failed", decidedByName: "Marco" }));
    expect(screen.getByText("Approved, but it couldn't finish: the order changed. Nothing was refunded.")).toBeTruthy();
  });
});
