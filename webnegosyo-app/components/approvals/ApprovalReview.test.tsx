import React from "react";
import { AccessibilityInfo } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";

import type { ApprovalsApi } from "../../lib/approvals/api";
import { approvalRequest } from "../../lib/approvals/test-fixtures";
import type { ApprovalRequestView } from "../../lib/approvals/types";
import { createAppQueryClient } from "../../lib/query/query-client";
import { ApprovalReview } from "./ApprovalReview";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true } }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

let client: QueryClient;

function fakeApi(request: ApprovalRequestView, decide = jest.fn(async () => ({ ok: true as const, status: 200, data: { request } }))) {
  const unused = jest.fn(async () => ({ ok: false as const, status: 500, error: "unused" }));
  const api: ApprovalsApi = {
    list: unused,
    get: jest.fn(async () => ({ ok: true as const, status: 200, data: { request } })),
    create: unused,
    decide,
    withdraw: unused,
    getRules: unused,
    saveRules: unused,
  };
  return { api, decide };
}

function renderReview(api: ApprovalsApi, intent: "approve" | "decline" | null) {
  render(
    <QueryClientProvider client={client}>
      <ApprovalReview tenantId="t-1" approvalId="req-1" viewerUserId="u-marco" isOffline={false} intent={intent} api={api} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  client = createAppQueryClient();
  jest.spyOn(AccessibilityInfo, "isScreenReaderEnabled").mockResolvedValue(false);
});

afterEach(() => {
  client.clear();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe("ApprovalReview", () => {
  it("shows amount, who and why, and what is worth knowing", async () => {
    const { api } = fakeApi(approvalRequest());
    renderReview(api, null);
    expect(await screen.findByText("Refund request")).toBeTruthy();
    expect(screen.getByText("of ₱480 paid in cash · comes out of Ana's drawer")).toBeTruthy();
    expect(screen.getByText("1 × Chicken Sisig")).toBeTruthy();
    expect(screen.getByText("“Got pork instead of chicken”")).toBeTruthy();
    expect(screen.getByText("Within your ₱1,000 limit")).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Approve 185 pesos" })).toBeTruthy();
  });

  it("an Approve from a push re-checks, counts down 4 seconds, then sends", async () => {
    jest.useFakeTimers();
    const { api, decide } = fakeApi(approvalRequest());
    renderReview(api, "approve");
    expect(await screen.findByText("Approving ₱185 for Ana…")).toBeTruthy();
    expect(decide).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(4000);
    });
    expect(decide).toHaveBeenCalledWith("t-1", "req-1", { decision: "approve", source: "push" });
  });

  it("Undo on the countdown sends nothing", async () => {
    jest.useFakeTimers();
    const { api, decide } = fakeApi(approvalRequest());
    renderReview(api, "approve");
    fireEvent.press(await screen.findByRole("button", { name: "Undo" }));
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(decide).not.toHaveBeenCalled();
  });

  it("an Approve from a push on a request someone already answered just shows the answer", async () => {
    const { api, decide } = fakeApi(
      approvalRequest({ status: "executed", canDecide: false, decidedBy: "u-lorna", decidedByName: "Lorna", decidedAt: "2026-10-12T04:34:00.000Z" }),
    );
    renderReview(api, "approve");
    expect(await screen.findByText("Lorna already approved this at 12:34 PM")).toBeTruthy();
    expect(screen.queryByText("Approving ₱185 for Ana…")).toBeNull();
    expect(decide).not.toHaveBeenCalled();
  });

  it("a Decline from a push opens the decline sheet", async () => {
    const { api } = fakeApi(approvalRequest());
    renderReview(api, "decline");
    expect(await screen.findByText("Ana sees your reason and note.")).toBeTruthy();
  });

  it("the person who asked sees their own answer, not the approver's dock", async () => {
    const { api } = fakeApi(
      approvalRequest({
        requestedBy: "u-marco",
        canDecide: false,
        status: "executed",
        decidedBy: "u-lorna",
        decidedByName: "Lorna",
        refundLabel: "R-0042",
        result: { cashInvolved: true, refundLabel: "R-0042" },
      }),
    );
    renderReview(api, null);
    expect(await screen.findByText("Approved by Lorna. Give ₱185 back from your drawer.")).toBeTruthy();
    expect(screen.queryByText("Lorna already approved this", { exact: false })).toBeNull();
  });
});
