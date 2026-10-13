import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";

import { createAppQueryClient } from "../../lib/query/query-client";
import { AskManagerRefund } from "./AskManagerRefund";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
// The sheet's reads go through the approvals client; this test is about the copy.
jest.mock("../../lib/approvals/use-approvals", () => ({
  useApprovalRules: () => ({ data: undefined, isLoading: false, error: null }),
  useInvalidateApprovals: () => async () => undefined,
}));
jest.mock("../../stores/pos-cart-store", () => ({ usePosCartStore: { getState: () => ({ reset: jest.fn() }) } }));
jest.mock("../../lib/offline/use-connectivity", () => ({ useConnectivity: () => ({ status: "online" }) }));
jest.mock("../../stores/auth-store", () => ({
  useAuthStore: (select: (state: unknown) => unknown) =>
    select({
      tenantId: "t-1",
      impersonatedTenantId: null,
      userId: "u-ana",
      role: "admin",
      isOwner: false,
      permissions: ["pos"],
      orderBackend: "platform",
      isDemo: false,
    }),
}));

function renderAsk(mode: "instead_of_edit" | "after_saved_edit") {
  render(
    <QueryClientProvider client={createAppQueryClient()}>
      <AskManagerRefund mode={mode} orderId="order-14" outletId={null} amount={185} paidTotal={480} />
    </QueryClientProvider>,
  );
}

describe("AskManagerRefund", () => {
  it("before saving: the edit is not saved, and the approval says what it will do", () => {
    renderAsk("instead_of_edit");
    fireEvent.press(screen.getByRole("button", { name: "Ask a manager to approve" }));
    expect(
      screen.getByText("Your item changes are not saved. When a manager approves, ₱185 goes back and the order's total drops by the same amount."),
    ).toBeTruthy();
  });

  it("after a saved edit: one tap asks for the exact amount", () => {
    renderAsk("after_saved_edit");
    fireEvent.press(screen.getByRole("button", { name: "Ask a manager for ₱185" }));
    expect(screen.getByText("Your edit is saved. This asks a manager to give back ₱185.")).toBeTruthy();
  });
});
