/**
 * One approval request as GET /api/approvals returns it, for tests. Shaped
 * like the server's toApprovalView output (src/lib/approvals/dto.ts) and the
 * order snapshot approval_order_snapshot() stores.
 */
import type { ApprovalRequestView } from "./types";

export const FIXTURE_NOW = new Date("2026-10-12T04:30:00.000Z"); // 12:30 PM Manila

export function approvalRequest(overrides: Partial<ApprovalRequestView> = {}): ApprovalRequestView {
  return {
    id: "req-1",
    tenantId: "t-1",
    outletId: null,
    kind: "refund",
    status: "pending",
    isDirect: false,
    externalOrderId: "order-14",
    orderNumber: "#14",
    payload: {
      scope: "items",
      lines: [{ orderItemId: "i-sisig", quantity: 1 }],
      restock: false,
      reasonLabel: "Wrong item served",
      allocation: [{ methodId: null, methodName: "Cash", amount: 185, isCash: true }],
    },
    amount: 185,
    approvedAmount: null,
    reasonCode: "wrong_item",
    note: "Got pork instead of chicken",
    orderSnapshot: {
      orderId: "order-14",
      orderNumber: "#14",
      status: "delivered",
      paymentStatus: "paid",
      paymentMethodName: "Cash",
      orderType: "Dine in",
      total: 480,
      revisionNumber: 0,
      createdAt: "2026-10-12T04:02:00.000Z",
      ledger: {
        implicit: false,
        net: 480,
        charged: 480,
        refunded: 0,
        tenders: [{ methodId: null, methodName: "Cash", net: 480, lastChargeAt: "2026-10-12T04:05:00.000Z" }],
      },
      items: [
        { id: "i-sisig", name: "Chicken Sisig", menuItemId: "m1", quantity: 2, lineTotal: 370 },
        { id: "i-rice", name: "Garlic Rice", menuItemId: "m2", quantity: 2, lineTotal: 110 },
      ],
    },
    requestedBy: "u-ana",
    requestedByName: "Ana Reyes",
    requesterShiftId: "shift-1",
    decidedBy: null,
    decidedByName: null,
    decidedAt: null,
    decisionReasonCode: null,
    decisionNote: null,
    expiresAt: "2026-10-12T04:58:00.000Z",
    executedAt: null,
    result: null,
    error: null,
    createdAt: "2026-10-12T04:28:00.000Z",
    updatedAt: "2026-10-12T04:28:00.000Z",
    refundLabel: null,
    canDecide: true,
    canWithdraw: false,
    isOverViewerLimit: false,
    viewerCap: 1000,
    ...overrides,
  };
}
