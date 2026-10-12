import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { GovDiscountCard } from "./GovDiscountCard";
import { computeGovDiscount, govDiscountLines, saleVatBreakdown } from "../../lib/gov-discount";
import type { OrderDiscountPayload } from "../../lib/order-discount";

function platterDiscount(): OrderDiscountPayload {
  const result = computeGovDiscount({
    vatStatus: "vat",
    lines: [{ key: "line-0", name: "Platter", quantity: 1, amount: 2000, eligible: true }],
    diners: 4,
    claimants: [
      { id: "c1", kind: "senior", name: "Juan Dela Cruz", idNumber: "OSCA-12345", allocation: { mode: "shared" } },
    ],
  });
  if (!result.ok) throw new Error("expected a priced sale");
  return {
    total: result.totalReduction,
    deliveryDiscount: 0,
    lines: govDiscountLines(result.claimants),
    allocationsByLine: {},
    government: {
      version: 1,
      vatStatus: "vat",
      serviceChargeMode: "full",
      diners: 4,
      claimants: result.claimants,
      vat: saleVatBreakdown({ vatStatus: "vat", itemsTotal: 2000, claimants: result.claimants }),
      approval: null,
    },
  };
}

describe("GovDiscountCard", () => {
  it("names the claimant with a masked ID until asked, then the full one", () => {
    render(<GovDiscountCard discount={platterDiscount()} />);

    expect(screen.getByText("Juan Dela Cruz")).toBeTruthy();
    expect(screen.getByText("ID ••••2345 · Shared table · 4 diners")).toBeTruthy();
    expect(screen.queryByText(/OSCA-12345/)).toBeNull();

    fireEvent.press(screen.getByRole("button", { name: "Show ID numbers" }));

    expect(screen.getByText("ID OSCA-12345 · Shared table · 4 diners")).toBeTruthy();
  });

  it("shows the VAT block a VAT store prints", () => {
    render(<GovDiscountCard discount={platterDiscount()} />);

    expect(screen.getByText("VAT-Exempt Sales")).toBeTruthy();
    expect(screen.getByText("₱446.43")).toBeTruthy();
    expect(screen.getByText("Less: SC Discount")).toBeTruthy();
  });

  it("renders nothing for an order without a Senior/PWD discount", () => {
    const { toJSON } = render(
      <GovDiscountCard discount={{ total: 10, deliveryDiscount: 0, lines: [], allocationsByLine: {} }} />,
    );
    expect(toJSON()).toBeNull();
  });
});
