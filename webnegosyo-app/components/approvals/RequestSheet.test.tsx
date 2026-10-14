import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";

import type { ApprovalsApi } from "../../lib/approvals/api";
import type { RequestOrder } from "../../lib/approvals/request-draft";
import { approvalRequest } from "../../lib/approvals/test-fixtures";
import { createAppQueryClient } from "../../lib/query/query-client";
import { clearUnsettledSends } from "../../lib/approvals/unsettled-sends";
import { RequestSheet, type RequestSheetProps } from "./RequestSheet";

const ORDER: RequestOrder = {
  orderId: "11111111-1111-4111-8111-111111111111",
  orderLabel: "#14",
  refundable: 480,
  paymentLabel: "cash",
  createdAt: new Date().toISOString(),
  outletId: null,
  items: [
    { id: "22222222-2222-4222-8222-222222222222", name: "Chicken Sisig", quantity: 2, lineTotal: 370 },
    { id: "33333333-3333-4333-8333-333333333333", name: "Garlic Rice", quantity: 2, lineTotal: 110 },
  ],
};

const RULES = {
  directRefundCap: 300,
  managerApproveCap: 1000,
  staffRefundWindow: "same_day" as const,
  discountPctNeedsApproval: 20,
  writeoffCostNeedsApproval: 500,
  expiryMinutes: 30,
  maxPendingPerStaff: 3,
};

let client: QueryClient;

function fakeApi(create: ApprovalsApi["create"]): ApprovalsApi {
  const unused = jest.fn(async () => ({ ok: false as const, status: 500, error: "unused" }));
  return {
    list: unused,
    get: unused,
    create,
    decide: unused,
    withdraw: unused,
    getRules: jest.fn(async () => ({
      ok: true as const,
      status: 200,
      data: { rules: RULES, approvers: [{ userId: "m1", name: "Marco Santos", outletId: null }], canEdit: false },
    })),
    saveRules: unused,
  };
}

function renderSheet(
  api: ApprovalsApi,
  options: { isOffline?: boolean; permissions?: string[]; seed?: { scope?: "balance" | "amount"; amount?: number }; refundable?: number } = {},
) {
  const onSent = jest.fn();
  render(
    <QueryClientProvider client={client}>
      <RequestSheet
        visible
        kind="refund"
        order={options.refundable !== undefined ? { ...ORDER, refundable: options.refundable, items: [] } : ORDER}
        seed={options.seed}
        tenantId="t-1"
        user={{ role: "admin", isOwner: false, permissions: options.permissions ?? ["pos"] }}
        userId="u-ana"
        isOffline={options.isOffline ?? false}
        onClose={jest.fn()}
        onSent={onSent}
        api={api}
      />
    </QueryClientProvider>,
  );
  return onSent;
}

beforeEach(() => {
  client = createAppQueryClient();
});

afterEach(() => {
  client.clear();
  clearUnsettledSends();
});

async function pickOneSisigWrongItem() {
  fireEvent.press(screen.getByRole("button", { name: "Add one Chicken Sisig" }));
  fireEvent.press(screen.getByRole("radio", { name: "Reason Wrong item served" }));
  await screen.findByText("Marco and the owner will get a notification.", { exact: false });
}

describe("RequestSheet", () => {
  it("asks for a reason before it can send", () => {
    const create = jest.fn();
    renderSheet(fakeApi(create));
    fireEvent.press(screen.getByRole("button", { name: "Add one Chicken Sisig" }));
    expect(screen.getByText("Pick a reason first")).toBeTruthy();
  });

  it("names who will be asked and sends for approval with one retry key", async () => {
    const create = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 0, error: "You're offline. Requests need internet so they're never sent twice.", code: "offline" })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        data: { route: "request", replayed: false, approvers: ["Marco", "Lorna"], request: approvalRequest() },
      });
    const onSent = renderSheet(fakeApi(create));
    await pickOneSisigWrongItem();
    const send = screen.getByRole("button", { name: "Send for approval · ₱185" });
    await act(async () => fireEvent.press(send));
    expect(await screen.findByText(/never sent twice/)).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Send for approval · ₱185" })));
    await waitFor(() => expect(onSent).toHaveBeenCalled());
    const [, first] = create.mock.calls[0];
    const [, second] = create.mock.calls[1];
    expect(first.idempotencyKey).toMatch(/^sheet_/);
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    expect(second).toMatchObject({ kind: "refund", reasonCode: "wrong_item", payload: { scope: "items", restock: false } });
  });

  it("says Refund now when the rules let the cashier act directly", async () => {
    renderSheet(fakeApi(jest.fn()), { permissions: ["pos", "orders", "order_refund"] });
    fireEvent.press(screen.getByRole("button", { name: "Add one Chicken Sisig" }));
    fireEvent.press(screen.getByRole("radio", { name: "Reason Wrong item served" }));
    expect(await screen.findByRole("button", { name: "Refund ₱185 now" })).toBeTruthy();
  });

  it("is disabled offline, with the reason", () => {
    renderSheet(fakeApi(jest.fn()), { isOffline: true });
    expect(screen.getByText("You're offline. Requests need internet so they're never sent twice.")).toBeTruthy();
  });

  it("shows the server's refusal for a store type it cannot serve yet", async () => {
    const create = jest.fn().mockResolvedValue({
      ok: false,
      status: 409,
      error: "Refunds for this store type are coming soon.",
      code: "backend_unsupported",
    });
    renderSheet(fakeApi(create));
    await pickOneSisigWrongItem();
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Send for approval · ₱185" })));
    expect(await screen.findByText("Refunds for this store type are coming soon.")).toBeTruthy();
  });

  it("an edit after a failed send goes out under a new retry key", async () => {
    const create = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 0, error: "offline", code: "offline" })
      .mockResolvedValueOnce({ ok: false, status: 0, error: "offline", code: "offline" });
    renderSheet(fakeApi(create));
    await pickOneSisigWrongItem();
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Send for approval · ₱185" })));
    fireEvent.press(screen.getByRole("button", { name: "Add one Garlic Rice" }));
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Send for approval · ₱240" })));
    expect(create.mock.calls[1][1].idempotencyKey).not.toBe(create.mock.calls[0][1].idempotencyKey);
  });

  it("explains an idempotency conflict and lets the next send go out fresh", async () => {
    const create = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 409, error: "Key reused with a different body.", code: "idempotency_conflict" })
      .mockResolvedValueOnce({ ok: false, status: 0, error: "offline", code: "offline" });
    renderSheet(fakeApi(create));
    await pickOneSisigWrongItem();
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Send for approval · ₱185" })));
    expect(await screen.findByText("This request was already sent with different details. Check the order for its status before sending again.")).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Send for approval · ₱185" })));
    expect(create.mock.calls[1][1].idempotencyKey).not.toBe(create.mock.calls[0][1].idempotencyKey);
  });

  it("an overpayment refund shows the exact amount and explains its refusals plainly", async () => {
    const create = jest.fn().mockResolvedValue({ ok: false, status: 422, error: "nothing_to_refund", code: "nothing_to_refund" });
    renderSheet(fakeApi(create), { seed: { scope: "balance", amount: 60 }, refundable: 60 });
    expect(screen.getByText("Overpayment to give back: ₱60")).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Refund Items" })).toBeNull();
    expect(screen.queryByLabelText("Put back in stock")).toBeNull();
    fireEvent.press(screen.getByRole("radio", { name: "Reason Charged twice" }));
    await act(async () => fireEvent.press(await screen.findByRole("button", { name: "Send for approval · ₱60" })));
    expect(create.mock.calls[0][1]).toMatchObject({ payload: { scope: "balance", amount: 60 } });
    expect(await screen.findByText("Nothing is overpaid on this order any more, so there is nothing to give back.")).toBeTruthy();
  });

  it("keeps the retry key when the sheet is closed and reopened after an unknown outcome", async () => {
    const create = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 0, error: "offline", code: "offline" })
      .mockResolvedValueOnce({ ok: true, status: 201, data: { route: "request", replayed: true, approvers: [], request: approvalRequest() } });
    const api = fakeApi(create);
    const props = (visible: boolean): RequestSheetProps => ({
      visible,
      kind: "refund",
      order: ORDER,
      tenantId: "t-1",
      user: { role: "admin", isOwner: false, permissions: ["pos"] },
      userId: "u-ana",
      isOffline: false,
      onClose: jest.fn(),
      onSent: jest.fn(),
      api,
    });
    const view = render(
      <QueryClientProvider client={client}>
        <RequestSheet {...props(true)} />
      </QueryClientProvider>,
    );
    await pickOneSisigWrongItem();
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Send for approval · ₱185" })));

    view.rerender(
      <QueryClientProvider client={client}>
        <RequestSheet {...props(false)} />
      </QueryClientProvider>,
    );
    view.rerender(
      <QueryClientProvider client={client}>
        <RequestSheet {...props(true)} />
      </QueryClientProvider>,
    );
    await pickOneSisigWrongItem();
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Send for approval · ₱185" })));

    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1][1].idempotencyKey).toBe(create.mock.calls[0][1].idempotencyKey);
  });
});
