/**
 * Discounting ONE item at the register, and choosing which item a voucher
 * that "only discounts 1 item" lands on — driven through the rendered sheet
 * and cart, bound to the real store and engine (only the network is mocked).
 */
import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { CartSheet } from "./CartSheet";
import { DiscountSheet } from "./DiscountSheet";
import type { StaffPermissionHolder } from "../../lib/staff-permissions";
import type { Voucher } from "../../lib/vouchers/types";
import { listVouchers, lookupVouchers } from "../../lib/voucher-service";
import { useAuthStore } from "../../stores/auth-store";
import { usePosCartStore } from "../../stores/pos-cart-store";

jest.mock("../../lib/voucher-service", () => ({
  lookupVouchers: jest.fn(),
  listVouchers: jest.fn(),
  burnPosRedemptions: jest.fn(),
}));

const lookup = lookupVouchers as jest.MockedFunction<typeof lookupVouchers>;
const list = listVouchers as jest.MockedFunction<typeof listVouchers>;

const OWNER: StaffPermissionHolder = { role: "admin", isOwner: true, permissions: null };

const FRIES = { menuItemId: "m-fries", name: "Fries", basePrice: 112, quantity: 5, selections: [] };
const BURGER = { menuItemId: "m-burger", name: "Burger", basePrice: 150, quantity: 1, selections: [] };

const halfOffOne: Voucher = {
  id: "v-one",
  code: "ONEHALF",
  name: "Half off one",
  discountType: "percent",
  discountValue: 50,
  scope: "universal",
  isStackable: true,
  usedCount: 0,
  channels: ["pos"],
  isActive: true,
  maxDiscountedUnits: 1,
};

function Register() {
  const lines = usePosCartStore((s) => s.lines);
  const discount = usePosCartStore((s) => s.discount);
  const store = usePosCartStore.getState();
  void discount;
  return (
    <>
      <CartSheet
        lines={lines}
        totals={store.totals()}
        orderTypes={[]}
        orderTypeId={null}
        isExpanded
        onToggle={() => {}}
        onSelectOrderType={() => {}}
        onChangeQty={() => {}}
        onClear={() => {}}
        onCharge={() => {}}
        discountLines={store.sessionDiscount().lines}
        onAddDiscount={() => {}}
      />
      <DiscountSheet
        visible
        onClose={() => {}}
        tenantId="t-1"
        user={OWNER}
        onCheckVoucher={store.checkVoucher}
        onApplyVoucher={store.applyVoucher}
        onApplyManual={(manual) => store.setManualDiscount(manual, OWNER)}
        appliedCodes={discount.vouchers.map((held) => held.code)}
        cartLines={lines.map((line) => ({ key: line.key, name: line.name, quantity: line.quantity }))}
        itemDiscounts={discount.itemDiscounts ?? []}
        onApplyItemDiscount={(item) => store.setItemDiscount(item, OWNER)}
        onRemoveItemDiscount={store.removeItemDiscount}
        unitChoices={store.voucherUnitChoices()}
        onSetUnitPicks={store.setVoucherUnitPicks}
      />
    </>
  );
}

jest.setTimeout(20000);

beforeEach(() => {
  lookup.mockReset();
  list.mockReset();
  list.mockResolvedValue([]);
  usePosCartStore.setState({
    lines: [],
    editContext: null,
    editWarnings: [],
    orderTypeId: null,
    orderTypeName: null,
    serviceCharge: { type: "fixed", value: 0 },
    customerName: "",
    attachedCustomer: null,
    discount: { vouchers: [], manual: null },
  });
  usePosCartStore.getState().add(FRIES);
  usePosCartStore.getState().add(BURGER);
  useAuthStore.setState({ outletId: null });
});

async function settle(): Promise<void> {
  await act(async () => {});
}

it("takes 50% off ONE of five fries and names the dish on the sale", async () => {
  render(<Register />);
  await settle();

  fireEvent.press(screen.getByText("One item"));
  fireEvent.press(screen.getByText("Fries ×5"));
  fireEvent.changeText(screen.getByLabelText("Item discount amount"), "50");
  fireEvent.changeText(screen.getByLabelText("Reason for item discount"), "Cold");
  fireEvent.press(screen.getByText("Discount 1 × Fries"));

  expect(await screen.findByText("−₱56.00")).toBeTruthy();
  // Named on the cart row and on the sheet's list of item discounts.
  expect(screen.getAllByText(/Fries ×1/)).toHaveLength(2);
});

it("moves a one-item voucher to the dish the cashier picks", async () => {
  lookup.mockResolvedValue([halfOffOne]);
  render(<Register />);
  await settle();

  fireEvent.changeText(screen.getByLabelText("Voucher code"), "ONEHALF");
  fireEvent.press(screen.getByText("Apply"));
  await waitFor(() => expect(lookup).toHaveBeenCalled());

  // The cheapest unit by default: one fries, ₱56.
  expect(await screen.findByText("−₱56.00")).toBeTruthy();

  fireEvent.press(screen.getByLabelText("Change which item ONEHALF applies to"));
  fireEvent.press(screen.getByLabelText("Fewer Fries"));
  fireEvent.press(screen.getByLabelText("More Burger"));
  fireEvent.press(screen.getByText("Use these"));

  expect(await screen.findByText("−₱75.00")).toBeTruthy();
});
