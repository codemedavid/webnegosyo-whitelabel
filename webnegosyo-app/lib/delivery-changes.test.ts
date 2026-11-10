import { merchantDeliveryChanges, type MerchantDeliveryDraft } from "./delivery-changes";

const opened: MerchantDeliveryDraft = {
  address: "Quezon Ave, Lucena City",
  pin: { lat: 13.9373, lng: 121.617 },
  unit: "Blk 4 Lot 12",
  landmark: "Tapat ng sari-sari store",
  riderNote: "Call when outside",
  storeNote: "",
};

describe("merchantDeliveryChanges (app mirror of the web card's save)", () => {
  it("sends only the store note when only the store note changed", () => {
    expect(merchantDeliveryChanges(opened, { ...opened, storeNote: " Extra napkins " })).toEqual({ storeNote: "Extra napkins" });
  });

  it("leaves a pin the customer moved alone when the merchant did not touch the pin", () => {
    // A sheet opened before the customer used the pin link still holds the old pin;
    // saving a note from it must not send that old pin (or the old words) back.
    const patch = merchantDeliveryChanges(opened, { ...opened, storeNote: "Gate is blue" });
    expect(patch).not.toHaveProperty("pin");
    expect(patch).not.toHaveProperty("address");
    expect(patch).not.toHaveProperty("landmark");
  });

  it("sends a moved pin and a cleared detail", () => {
    const patch = merchantDeliveryChanges(opened, { ...opened, pin: { lat: 13.94, lng: 121.62 }, landmark: "  " });
    expect(patch).toEqual({ pin: { lat: 13.94, lng: 121.62 }, landmark: "" });
  });

  it("sends a pin picked on an order that had none", () => {
    const patch = merchantDeliveryChanges({ ...opened, pin: null }, { ...opened, pin: { lat: 1, lng: 2 } });
    expect(patch).toEqual({ pin: { lat: 1, lng: 2 } });
  });

  it("returns an empty patch when nothing changed (whitespace only)", () => {
    expect(merchantDeliveryChanges(opened, { ...opened, unit: " Blk 4 Lot 12 " })).toEqual({});
  });

  it("never sends a blank address (the server refuses one)", () => {
    expect(merchantDeliveryChanges(opened, { ...opened, address: "   " })).toEqual({});
  });
});
