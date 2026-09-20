import React from "react";
import { render } from "@testing-library/react-native";
import { Text } from "react-native";
import { OrderSettlementReader, type StaffPayment } from "./OrderSettlementReader";
import { ORDER_LEDGER_LIMIT, TRUNCATED_LEDGER_MESSAGE } from "../lib/backends/supabase-adapter";

/**
 * The reader used to mount one ledger read PER ORDER. On the platform backend
 * every one of those reads polls, so a shift of 200 sales was 200 polling
 * requests against `order_payments` — the busiest endpoint in the 2026-09-20
 * saturation. On the platform it now asks once for every order; Convex, a live
 * subscription with nothing to poll, keeps the per-order reads its deployed
 * bundle already answers.
 */

const mockUseSafeQuery = jest.fn();
let mockRoute = "platform";

jest.mock("../lib/hooks", () => ({
  useSafeQuery: (...args: unknown[]) => mockUseSafeQuery(...args),
  useRefRoute: () => mockRoute,
}));

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

function payment(orderId: string, id: string): StaffPayment {
  return {
    _id: id,
    orderId,
    kind: "charge",
    amount: 10,
    paymentMethodName: "Cash",
    recordedBy: "cashier",
    _creationTime: 1,
  } as unknown as StaffPayment;
}

function refsAsked(): { ref: string; args: unknown }[] {
  return mockUseSafeQuery.mock.calls.map((call) => ({ ref: String(call[0]), args: call[1] }));
}

function Probe({ ids }: { ids: readonly string[] }) {
  return (
    <OrderSettlementReader ids={ids}>
      {(payments, ready, error) => (
        <Text testID="out">{JSON.stringify({ n: payments.length, ready, error })}</Text>
      )}
    </OrderSettlementReader>
  );
}

function outputOf(screen: ReturnType<typeof render>) {
  return JSON.parse(screen.getByTestId("out").props.children as string) as {
    n: number;
    ready: boolean;
    error: string | null;
  };
}

beforeEach(() => {
  mockUseSafeQuery.mockReset();
  mockRoute = "platform";
});

describe("on the platform backend", () => {
  it("asks for every order's ledger in one read", () => {
    mockUseSafeQuery.mockReturnValue({
      data: [payment(A, "p1"), payment(B, "p2"), payment(B, "p3")],
      error: null,
      isMissingFunction: false,
    });

    const screen = render(<Probe ids={[A, B]} />);

    const asked = refsAsked().filter((call) => call.args !== "skip");
    expect(asked).toEqual([{ ref: "orders:getOrderPaymentsForOrders", args: { orderIds: [A, B] } }]);
    expect(outputOf(screen)).toEqual({ n: 3, ready: true, error: null });
  });

  it("is not ready until the read has answered", () => {
    mockUseSafeQuery.mockReturnValue({ data: undefined, error: null, isMissingFunction: false });

    const screen = render(<Probe ids={[A]} />);

    expect(outputOf(screen)).toEqual({ n: 0, ready: false, error: null });
  });

  it("trusts a busy order's complete ledger instead of guessing at truncation", () => {
    // The bulk read is capped at the per-order ceiling times the orders it
    // names, and the adapter REFUSES a request that fills that cap. So a
    // single order carrying a ceiling's worth of rows inside a multi-order
    // read is complete data, and refusing it here would strand a busy shift.
    mockUseSafeQuery.mockReturnValue({
      data: Array.from({ length: ORDER_LEDGER_LIMIT }, (_, i) => payment(A, `p${i}`)),
      error: null,
      isMissingFunction: false,
    });

    const screen = render(<Probe ids={[A, B]} />);

    expect(outputOf(screen)).toEqual({ n: ORDER_LEDGER_LIMIT, ready: true, error: null });
  });

  it("surfaces the adapter's refusal when the read really was cut short", () => {
    mockUseSafeQuery.mockReturnValue({
      data: undefined,
      error: TRUNCATED_LEDGER_MESSAGE,
      isMissingFunction: false,
    });

    const screen = render(<Probe ids={[A, B]} />);

    expect(outputOf(screen).ready).toBe(false);
    expect(outputOf(screen).error).toMatch(/incomplete/);
  });

  it("reports a read failure", () => {
    mockUseSafeQuery.mockReturnValue({ data: undefined, error: "Connection lost", isMissingFunction: false });

    expect(outputOf(render(<Probe ids={[A]} />))).toEqual({ n: 0, ready: false, error: "Connection lost" });
  });

  it("is ready with nothing to total when there are no orders", () => {
    mockUseSafeQuery.mockReturnValue({ data: [], error: null, isMissingFunction: false });

    const screen = render(<Probe ids={[]} />);

    expect(outputOf(screen)).toEqual({ n: 0, ready: true, error: null });
  });
});

describe("on Convex", () => {
  it("keeps one live read per order, which the deployed bundles already answer", () => {
    mockRoute = "convex";
    // Stable per order: a fresh array every render would re-run the reader's
    // report effect forever, which is a property of the fake, not the reader.
    const ledgers = new Map([A, B].map((id) => [id, [payment(id, `p-${id}`)]]));
    mockUseSafeQuery.mockImplementation((_ref: unknown, args: { orderId?: string } | "skip") => ({
      data: args === "skip" || !args?.orderId ? undefined : ledgers.get(args.orderId),
      error: null,
      isMissingFunction: false,
    }));

    const screen = render(<Probe ids={[A, B]} />);

    // The reader re-renders as each ledger reports in; what matters is which
    // reads it asked for, not how many renders it took.
    const perOrder = refsAsked().filter((call) => call.ref === "orders:getOrderPayments");
    const distinctArgs = [...new Set(perOrder.map((call) => JSON.stringify(call.args)))];
    expect(distinctArgs).toEqual([JSON.stringify({ orderId: A }), JSON.stringify({ orderId: B })]);
    expect(refsAsked().some((call) => call.ref === "orders:getOrderPaymentsForOrders" && call.args !== "skip")).toBe(false);
    expect(outputOf(screen)).toEqual({ n: 2, ready: true, error: null });
  });
});
