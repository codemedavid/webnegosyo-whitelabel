/**
 * The delivery sheet, driven the way a cashier uses it: search a place, pick
 * it, and get the store's own road-distance fee — without ever losing a fee
 * they typed themselves. Only the network (`address-search`) and the setup
 * read are mocked; the sheet, the suggestion hook and the fee logic are real.
 */

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { DeliverySheet } from "./DeliverySheet";
import { useAuthStore } from "../../stores/auth-store";
import { clearedSaleDelivery, type PosDeliveryDetails } from "../../lib/pos-delivery";
import { fetchDeliveryQuote, fetchMapPreviewUrl, searchAddresses } from "../../lib/maps/address-search";
import { clearAddressSearchCache } from "../../lib/maps/use-address-search";
import { clearDeliveryQuoteCache } from "../../lib/maps/use-delivery-fee-suggestion";
import type { CheckoutSetup } from "../../lib/pos-checkout-fields";

jest.mock("../../lib/supabase", () => ({ supabase: {} }));
jest.mock("../../lib/web-app-url", () => ({ getWebAppUrl: () => "https://www.webnegosyo.com" }));
jest.mock("../../lib/authorized-post", () => ({ getAccessTokenBounded: jest.fn(async () => "token") }));
jest.mock("../../lib/maps/address-search", () => ({
  ...jest.requireActual("../../lib/maps/address-search"),
  searchAddresses: jest.fn(),
  fetchMapPreviewUrl: jest.fn(),
  fetchDeliveryQuote: jest.fn(),
}));

const SETUP: CheckoutSetup = {
  fields: [],
  delivery: {
    store: { lat: 14.6, lng: 121.0 },
    distance: { perKm: 15, minFee: 50, radiusKm: 10 },
    freeDeliveryMin: null,
    isLalamove: false,
  },
};
let mockSetup: CheckoutSetup = SETUP;
jest.mock("../../lib/query/use-checkout-setup", () => ({
  useCheckoutSetup: () => ({ data: mockSetup }),
}));

const search = searchAddresses as jest.MockedFunction<typeof searchAddresses>;
const preview = fetchMapPreviewUrl as jest.MockedFunction<typeof fetchMapPreviewUrl>;
const quote = fetchDeliveryQuote as jest.MockedFunction<typeof fetchDeliveryQuote>;

const SM_NORTH = {
  name: "SM North EDSA",
  address: "North Ave, Quezon City",
  location: { lat: 14.6566, lng: 121.0298 },
};

function renderSheet(delivery: PosDeliveryDetails = clearedSaleDelivery().delivery, feeOnly = false) {
  const onSave = jest.fn();
  render(
    <DeliverySheet visible onClose={jest.fn()} delivery={delivery} onSave={onSave} feeOnly={feeOnly} itemsSubtotal={300} />,
  );
  return { onSave };
}

async function pickSmNorth() {
  fireEvent.changeText(screen.getByLabelText("Delivery address"), "SM North");
  fireEvent.press(await screen.findByLabelText("Use SM North EDSA, North Ave, Quezon City"));
}

beforeEach(() => {
  jest.clearAllMocks();
  clearAddressSearchCache();
  clearDeliveryQuoteCache();
  mockSetup = SETUP;
  useAuthStore.setState({ tenantId: "t1", impersonatedTenantId: null });
  search.mockResolvedValue({ ok: true, value: [SM_NORTH] });
  preview.mockResolvedValue({ ok: true, value: "https://snapshot.apple-mapkit.com/x" });
  quote.mockResolvedValue({ ok: true, value: { fee: 90, distanceKm: 6, withinRadius: true, radiusKm: 10 } });
});

describe("DeliverySheet", () => {
  it("searches places, pins the pick and fills in the store's road-distance fee", async () => {
    const { onSave } = renderSheet();

    await pickSmNorth();

    expect(screen.getByLabelText("Delivery address").props.value).toBe("SM North EDSA, North Ave, Quezon City");
    await waitFor(() => expect(screen.getByLabelText("Delivery fee").props.value).toBe("90"));
    expect(screen.getByText("Auto")).toBeTruthy();
    expect(screen.getByText(/Your store's rate for 6\.0 km by road/)).toBeTruthy();
    expect(search).toHaveBeenCalledWith("t1", "SM North", { lat: 14.6, lng: 121.0 });
    expect(quote).toHaveBeenCalledWith("t1", SM_NORTH.location);

    fireEvent.press(screen.getByText("Save"));
    expect(onSave).toHaveBeenCalledWith({
      fee: 90,
      address: "SM North EDSA, North Ave, Quezon City",
      phone: "",
      location: SM_NORTH.location,
    });
  });

  it("never overwrites a fee the cashier typed, but offers the store's rate", async () => {
    renderSheet();
    fireEvent.changeText(screen.getByLabelText("Delivery fee"), "60");

    await pickSmNorth();

    const useRate = await screen.findByText("Use your store's rate: ₱90.00 · 6.0 km");
    expect(screen.getByLabelText("Delivery fee").props.value).toBe("60");
    fireEvent.press(useRate);
    expect(screen.getByLabelText("Delivery fee").props.value).toBe("90");
  });

  it("falls back to a labelled estimate when the store's quote cannot be reached", async () => {
    quote.mockResolvedValue({ ok: false, reason: "offline" });
    renderSheet();

    await pickSmNorth();

    expect(await screen.findByText(/Estimate for about .* by road \(offline\)/)).toBeTruthy();
    expect(Number(screen.getByLabelText("Delivery fee").props.value)).toBeGreaterThanOrEqual(50);
  });

  it("saves a typed address with no pin when the cashier never picks a place", async () => {
    search.mockResolvedValue({ ok: true, value: [] });
    const { onSave } = renderSheet();

    fireEvent.changeText(screen.getByLabelText("Delivery address"), "Blk 5 Lot 2, Imus");
    expect(await screen.findByText("No matches — the address is saved as typed.")).toBeTruthy();
    fireEvent.press(screen.getByText("Save"));

    expect(onSave).toHaveBeenCalledWith({ fee: null, address: "Blk 5 Lot 2, Imus", phone: "", location: null });
    expect(quote).not.toHaveBeenCalled();
  });

  it("asks for nothing but the fee when editing a placed order", () => {
    renderSheet({ fee: 40, address: "", phone: "" }, true);

    expect(screen.getByText("Delivery fee")).toBeTruthy();
    expect(screen.queryByLabelText("Delivery address")).toBeNull();
    expect(screen.queryByLabelText("Contact number")).toBeNull();
    expect(screen.getByLabelText("Delivery fee").props.value).toBe("40");
  });

  it("rejects a typed fee that is not an amount instead of silently dropping it", () => {
    const { onSave } = renderSheet();

    fireEvent.changeText(screen.getByLabelText("Delivery fee"), "fifty");
    fireEvent.press(screen.getByText("Save"));

    expect(screen.getByText("Enter the fee as a plain amount, e.g. 50")).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });
});
