import { canFixDelivery, deliveryPinNotice } from "./delivery-fix";

describe("canFixDelivery", () => {
  it("is open on a platform store's order with no rider", () => {
    expect(canFixDelivery({ status: "pending" }, "platform")).toBe(true);
  });

  it("is not offered on other backends", () => {
    expect(canFixDelivery({ status: "pending" }, "convex")).toBe(false);
    expect(canFixDelivery({ status: "pending" }, null)).toBe(false);
  });

  it.each(["delivered", "cancelled", "completed"])("is closed on a %s order", (status) => {
    expect(canFixDelivery({ status }, "platform")).toBe(false);
  });

  it("is closed while a rider is booked, and open again once that booking died", () => {
    expect(canFixDelivery({ lalamoveOrderId: "1", lalamoveStatus: "ON_GOING" }, "platform")).toBe(false);
    expect(canFixDelivery({ lalamoveStatus: "BOOKING" }, "platform")).toBe(false);
    expect(canFixDelivery({ lalamoveOrderId: "1", lalamoveStatus: "CANCELED" }, "platform")).toBe(true);
  });
});

describe("deliveryPinNotice", () => {
  const pinned = { delivery_lat: "14.5", delivery_lng: "121" };

  it("asks for a pin when there is none", () => {
    expect(deliveryPinNotice({ customerData: {} })).toMatch(/no pin/);
  });

  it("tells the merchant to call when the customer couldn't find their place", () => {
    expect(deliveryPinNotice({ customerData: { delivery_pin_skipped: "true" } })).toMatch(/Call them/);
  });

  it("says nothing about an ordinary pin", () => {
    expect(deliveryPinNotice({ customerData: pinned })).toBeNull();
    expect(deliveryPinNotice({ latitude: 14.5, longitude: 121 })).toBeNull();
  });

  it("says who moved it, how far it is, and that the fee did not change", () => {
    expect(deliveryPinNotice({ customerData: { ...pinned, delivery_pin_updated_by: "customer", delivery_pin_km: "3.2" } })).toBe(
      "The customer set this pin. It is about 3.2 km from the store. The delivery fee stays as it is, so change it if it should be different.",
    );
  });
});
