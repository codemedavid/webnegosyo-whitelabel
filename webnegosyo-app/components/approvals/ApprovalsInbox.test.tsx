import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { approvalRequest, FIXTURE_NOW } from "../../lib/approvals/test-fixtures";
import type { ApprovalList, ApprovalsQuery } from "../../lib/approvals/use-approvals";
import { ApprovalsInboxView } from "./ApprovalsInbox";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

function query(partial: Partial<ApprovalsQuery<ApprovalList>> = {}): ApprovalsQuery<ApprovalList> {
  return {
    data: { requests: [], isApprover: true },
    isLoading: false,
    error: null,
    isShowingStale: false,
    isRefetching: false,
    refetch: jest.fn(async () => undefined),
    dataUpdatedAt: FIXTURE_NOW.getTime(),
    ...partial,
  };
}

function renderInbox(pending: ApprovalsQuery<ApprovalList>, recent = query(), isOffline = false) {
  const onOpen = jest.fn();
  render(<ApprovalsInboxView pending={pending} recent={recent} now={FIXTURE_NOW} isOffline={isOffline} onOpen={onOpen} />);
  return onOpen;
}

describe("ApprovalsInbox", () => {
  it("shows each waiting request as a card that opens the review screen", () => {
    const onOpen = renderInbox(query({ data: { requests: [approvalRequest()], isApprover: true } }));
    expect(screen.getByText("Refund ₱185 · #14")).toBeTruthy();
    expect(screen.getByText("Ana · Wrong item served · 2 min ago")).toBeTruthy();
    expect(screen.getByText("“Got pork instead of chicken”")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Review refund ₱185 from Ana" }));
    expect(onOpen).toHaveBeenCalledWith("req-1");
  });

  it("shows the time left only in the last 10 minutes", () => {
    renderInbox(query({ data: { requests: [approvalRequest({ expiresAt: "2026-10-12T04:38:00.000Z" })], isApprover: true } }));
    expect(screen.getByText("8 min left")).toBeTruthy();
  });

  it("marks a request over the viewer's limit as the owner's", () => {
    renderInbox(
      query({
        data: { requests: [approvalRequest({ amount: 1450, canDecide: false, isOverViewerLimit: true })], isApprover: true },
      }),
    );
    expect(screen.getByText("Over your ₱1,000 limit · sent to the owner")).toBeTruthy();
  });

  it("says the team is all set when nothing waits", () => {
    renderInbox(query());
    expect(screen.getByText("Nothing waiting. Your team's all set.")).toBeTruthy();
  });

  it("folds recent decisions behind their summary", () => {
    const recent = query({
      data: { requests: [approvalRequest({ id: "r1", status: "declined", decidedByName: "Lorna", decidedAt: "2026-10-12T04:10:00.000Z" })], isApprover: true },
    });
    renderInbox(query(), recent);
    expect(screen.queryByText("Declined by Lorna · 12:10 PM")).toBeNull();
    fireEvent.press(screen.getByRole("button", { name: "Recently decided: Approved 0 · Declined 1 · Expired 0" }));
    expect(screen.getByText("Declined by Lorna · 12:10 PM")).toBeTruthy();
  });

  it("keeps the cards and says so when a refresh failed", () => {
    renderInbox(
      query({
        data: { requests: [approvalRequest()], isApprover: true },
        error: { message: "x", status: 0, code: "offline" },
        isShowingStale: true,
      }),
    );
    expect(screen.getByText(/Couldn't refresh/)).toBeTruthy();
    expect(screen.getByText("Refund ₱185 · #14")).toBeTruthy();
  });

  it("explains a first load that failed", () => {
    renderInbox(query({ data: undefined, error: { message: "x", status: 0, code: "offline" } }));
    expect(screen.getByText("Couldn't load requests")).toBeTruthy();
    expect(screen.getByText("Check your connection and try again.")).toBeTruthy();
  });

  it("does not blame the connection when the server answered", () => {
    renderInbox(query({ data: undefined, error: { message: "x", status: 500, code: null } }));
    expect(screen.getByText("Couldn't load requests")).toBeTruthy();
    expect(screen.getByText("Something went wrong on our side. Try again in a moment.")).toBeTruthy();
    expect(screen.queryByText("Check your connection and try again.")).toBeNull();
  });

  it("shows a calm notice, not an error, when the server has no approvals yet", () => {
    renderInbox(query({ data: undefined, error: { message: "x", status: 404, code: null } }));
    expect(screen.getByText("Approvals are on their way")).toBeTruthy();
    expect(screen.queryByText("Couldn't load requests")).toBeNull();
  });

  it("passes on the server's own words when it refuses the account", () => {
    renderInbox(query({ data: undefined, error: { message: "You can't see this store's requests.", status: 403, code: "forbidden" } }));
    expect(screen.getByText("You can't see this store's requests.")).toBeTruthy();
  });

  it("names an overpayment refund as such", () => {
    renderInbox(query({ data: { requests: [approvalRequest({ payload: { scope: "balance", amount: 185 } })], isApprover: true } }));
    expect(screen.getByText("Refund overpayment ₱185 · #14")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Review refund overpayment ₱185 from Ana" })).toBeTruthy();
  });
});
