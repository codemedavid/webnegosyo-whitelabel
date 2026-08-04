/**
 * Taking money off a sale, driven through the rendered sheet.
 *
 * The sheet is where a cashier meets the voucher engine, and it is the last
 * place in the register where a decision about money was made with nothing able
 * to observe it: `jest.config.js` scoped the suite to `lib/` and later
 * `stores/`, so every module underneath this component was covered and the
 * component that calls them was not.
 *
 * That gap is not theoretical. A code that existed but the engine REFUSED was
 * accepted here, priced at zero, rendered no row, and closed the sheet with
 * nothing changed and no reason for the cashier to give the customer. The
 * pure modules were all correct; the sheet threw their answer away.
 *
 * So the only thing mocked is the network — `lookupVouchers`, which genuinely
 * cannot run in a test. The voucher engine, the discount session, the cart
 * engine, the permission check and the register store are all the shipping
 * code, wired together the way `app/(main)/pos.tsx` wires them, and every
 * assertion is on what the cashier can actually see.
 */

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { CartSheet } from "./CartSheet";
import { DiscountSheet } from "./DiscountSheet";
import type { StaffPermissionHolder } from "../../lib/staff-permissions";
import type { Voucher } from "../../lib/vouchers/types";
import { lookupVouchers } from "../../lib/voucher-service";
import { useAuthStore } from "../../stores/auth-store";
import { usePosCartStore } from "../../stores/pos-cart-store";

jest.mock("../../lib/voucher-service", () => ({
  lookupVouchers: jest.fn(),
  burnPosRedemptions: jest.fn(),
}));

const lookup = lookupVouchers as jest.MockedFunction<typeof lookupVouchers>;

const voucher = (overrides: Partial<Voucher>): Voucher => ({
  id: "v-save20",
  code: "SAVE20",
  name: "20% off",
  discountType: "percent",
  discountValue: 20,
  scope: "universal",
  isStackable: true,
  usedCount: 0,
  channels: ["pos", "checkout"],
  isActive: true,
  ...overrides,
});

/** ₱300 of coffee on the counter. */
const LATTE = {
  menuItemId: "m-latte",
  name: "Latte",
  basePrice: 150,
  quantity: 2,
  selections: [],
};

const OWNER: StaffPermissionHolder = { role: "admin", isOwner: true, permissions: null };
/** A cashier granted the register but not the authority to discount by hand. */
const CASHIER: StaffPermissionHolder = {
  role: "admin",
  isOwner: false,
  permissions: ["pos"],
};

/**
 * The register as the cashier sees it: the discount sheet open over the cart,
 * both bound to the real store.
 *
 * Both are rendered because "the code was applied" is only true if the sale
 * changed — asserting on the sheet alone is how a code priced at zero passed
 * for accepted.
 */
function Register({ user }: { user: StaffPermissionHolder }) {
  const lines = usePosCartStore((s) => s.lines);
  const discount = usePosCartStore((s) => s.discount);
  const {
    applyVoucher,
    checkVoucher,
    setManualDiscount,
    sessionDiscount,
    totals,
  } = usePosCartStore.getState();

  // Read after the subscriptions above so each change re-prices, exactly as
  // the screen's memos do.
  void discount;
  const discountLines = sessionDiscount().lines;

  return (
    <>
      <CartSheet
        lines={lines}
        totals={totals()}
        orderTypes={[]}
        orderTypeId={null}
        isExpanded
        onToggle={() => {}}
        onSelectOrderType={() => {}}
        onChangeQty={() => {}}
        onClear={() => {}}
        onCharge={() => {}}
        discountLines={discountLines}
        onAddDiscount={() => {}}
      />
      <DiscountSheet
        visible
        onClose={() => {}}
        tenantId="t-1"
        user={user}
        onCheckVoucher={checkVoucher}
        onApplyVoucher={applyVoucher}
        onApplyManual={(manual) => setManualDiscount(manual, user)}
      />
    </>
  );
}

function openRegister(): void {
  usePosCartStore.setState({
    lines: [],
    editContext: null,
    editWarnings: [],
    orderTypeId: null,
    orderTypeName: null,
    // A real order type's 10% charge, so the Charge figure is distinct from
    // the subtotal and an assertion on it cannot pass by accident.
    serviceCharge: { type: "percentage", value: 10 },
    customerName: "",
    attachedCustomer: null,
    discount: { vouchers: [], manual: null },
  });
  usePosCartStore.getState().add(LATTE);
}

beforeEach(() => {
  lookup.mockReset();
  openRegister();
  useAuthStore.setState({ outletId: null });
});

/** Types a code into the sheet and presses Apply. */
async function enterCode(code: string): Promise<void> {
  fireEvent.changeText(screen.getByLabelText("Voucher code"), code);
  fireEvent.press(screen.getByText("Apply"));
  await waitFor(() => expect(lookup).toHaveBeenCalled());
}

describe("a code the engine accepts", () => {
  it("puts a named discount row on the sale for the right money", async () => {
    lookup.mockResolvedValue([voucher({})]);
    render(<Register user={OWNER} />);

    await enterCode("SAVE20");

    // 20% of the ₱300 of coffee — the service charge is not discounted.
    expect(await screen.findByText("20% off")).toBeTruthy();
    expect(screen.getByText("−₱60.00")).toBeTruthy();
    // Charge is net: ₱300 + ₱30 service − ₱60.
    expect(screen.getByText("₱270.00")).toBeTruthy();
    expect(screen.queryByText("₱330.00")).toBeNull();
  });
});

describe("a code the engine refuses", () => {
  /**
   * The shipped defect. Each of these codes EXISTS — the lookup returns it —
   * and is worth nothing on this particular sale. Before the verdict was
   * consulted the sheet took the lookup's word for it, added the voucher, and
   * closed on an unchanged sale.
   */
  it.each([
    [
      "expired",
      voucher({ code: "LASTWEEK", endsAt: "2020-01-01T00:00:00.000Z" }),
      "This voucher has expired.",
    ],
    [
      "fully claimed",
      voucher({ code: "GONE", usageLimitTotal: 50, usedCount: 50 }),
      "This voucher has been fully claimed.",
    ],
    [
      "below its minimum spend",
      voucher({ code: "BIGSPEND", minOrderAmount: 500 }),
      "Add ₱200.00 more to use this voucher.",
    ],
    [
      "for another branch",
      voucher({ code: "MAKATI", outletIds: ["o-makati"] }),
      "This voucher is not valid at this branch.",
    ],
    [
      "worth nothing at a counter",
      voucher({ code: "FREEDEL", discountType: "free_delivery", discountValue: 0 }),
      "This voucher only applies to delivery orders.",
    ],
  ])("tells the cashier why a %s code was not applied", async (_case, refused, reason) => {
    useAuthStore.setState({ outletId: "o-cebu" });
    lookup.mockResolvedValue([refused]);
    render(<Register user={OWNER} />);

    await enterCode(refused.code);

    // The engine's own sentence, verbatim — the cashier has something to say.
    expect(await screen.findByText(reason)).toBeTruthy();
    // And nothing was taken off: no row, and the sale still costs ₱330.
    expect(screen.queryByText(refused.name)).toBeNull();
    expect(screen.getByText("₱330.00")).toBeTruthy();
    expect(usePosCartStore.getState().discount.vouchers).toHaveLength(0);
  });

  it("refuses a code already on the sale rather than silently doing nothing", async () => {
    lookup.mockResolvedValue([voucher({})]);
    render(<Register user={OWNER} />);

    await enterCode("SAVE20");
    await screen.findByText("20% off");

    lookup.mockClear();
    await enterCode("SAVE20");

    expect(await screen.findByText("That code is already applied to this sale.")).toBeTruthy();
    // Still one row, still ₱60 — not doubled.
    expect(screen.getAllByText("−₱60.00")).toHaveLength(1);
    expect(usePosCartStore.getState().discount.vouchers).toHaveLength(1);
  });
});

describe("a code that is not found at all", () => {
  it("reports it and takes nothing off", async () => {
    // The lookup fails closed: unknown code, or simply no signal at the
    // counter. Either way an unverifiable code is worth zero.
    lookup.mockResolvedValue([]);
    render(<Register user={OWNER} />);

    await enterCode("NOPE");

    expect(
      await screen.findByText("That code could not be applied. Check it and try again."),
    ).toBeTruthy();
    expect(screen.getByText("₱330.00")).toBeTruthy();
    expect(usePosCartStore.getState().discount.vouchers).toHaveLength(0);
  });
});

describe("the manual open discount", () => {
  it("is not reachable by a cashier without the vouchers permission", () => {
    render(<Register user={CASHIER} />);

    // Not merely disabled — the whole section is absent, so there is no
    // amount box, no reason box and no button to press.
    expect(screen.queryByText("Manual discount")).toBeNull();
    expect(screen.queryByLabelText("Discount amount")).toBeNull();
    expect(screen.queryByLabelText("Reason for discount")).toBeNull();
    expect(screen.queryByText("Apply discount")).toBeNull();

    // The voucher route stays open to them: honouring a code the shop
    // advertises is ordinary counter work.
    expect(screen.getByLabelText("Voucher code")).toBeTruthy();
  });

  it("requires a written reason before any money comes off", () => {
    render(<Register user={OWNER} />);

    fireEvent.changeText(screen.getByLabelText("Discount amount"), "50");
    fireEvent.press(screen.getByText("Apply discount"));

    expect(screen.getByText("Give a reason for this discount.")).toBeTruthy();
    expect(screen.getByText("₱330.00")).toBeTruthy();
    expect(usePosCartStore.getState().discount.manual).toBeNull();
  });

  it("refuses more than 100% rather than clamping it", () => {
    render(<Register user={OWNER} />);

    // A cashier meaning 10.00 and typing 1000 must be stopped, not obeyed
    // with a free sale.
    fireEvent.press(screen.getByText("%"));
    fireEvent.changeText(screen.getByLabelText("Discount amount"), "1000");
    fireEvent.changeText(screen.getByLabelText("Reason for discount"), "regular");
    fireEvent.press(screen.getByText("Apply discount"));

    expect(screen.getByText("A discount cannot exceed 100%.")).toBeTruthy();
    expect(screen.getByText("₱330.00")).toBeTruthy();
    expect(usePosCartStore.getState().discount.manual).toBeNull();
  });

  it("applies a reasoned discount and prints the reason on the row", () => {
    render(<Register user={OWNER} />);

    fireEvent.changeText(screen.getByLabelText("Discount amount"), "50");
    fireEvent.changeText(screen.getByLabelText("Reason for discount"), "damaged cup");
    fireEvent.press(screen.getByText("Apply discount"));

    expect(screen.getByText("Discount — damaged cup")).toBeTruthy();
    expect(screen.getByText("−₱50.00")).toBeTruthy();
    expect(screen.getByText("₱280.00")).toBeTruthy();
  });
});
