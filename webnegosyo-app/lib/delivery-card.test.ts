import { buildDeliveryCard, isDeliveryDetailRow } from "./delivery-card";

// googleMapsUrl lives beside the network helpers; keep their auth out of a pure test.
jest.mock("./authorized-post", () => ({ getAccessTokenBounded: jest.fn() }));
jest.mock("./web-app-url", () => ({ getWebAppUrl: () => "https://www.webnegosyo.com" }));

describe("buildDeliveryCard", () => {
  it("links the exact pin and lists unit, landmark and the note to rider", () => {
    expect(
      buildDeliveryCard({
        address: "12 Mabini St",
        customerData: {
          delivery_lat: "14.5861",
          delivery_lng: "121.1761",
          delivery_unit: "Unit 5B",
          "Nearest Landmark": "Blue gate",
          delivery_rider_note: "Call on arrival",
        },
      }),
    ).toEqual({
      mapUrl: "https://www.google.com/maps/search/?api=1&query=14.5861%2C121.1761",
      lines: [
        { label: "Unit / Floor", value: "Unit 5B" },
        { label: "Landmark", value: "Blue gate" },
        { label: "Note to rider", value: "Call on arrival" },
      ],
    });
  });

  it("uses a Convex order's own coordinates when customerData has none", () => {
    expect(buildDeliveryCard({ address: "Mabini", customerData: {}, latitude: 14.6, longitude: 121 }).mapUrl).toBe(
      "https://www.google.com/maps/search/?api=1&query=14.6%2C121",
    );
  });

  it("searches the address when there is no usable pin, and links nothing without either", () => {
    expect(buildDeliveryCard({ address: "Purok 3", customerData: { delivery_lat: "0", delivery_lng: "0" } }).mapUrl).toBe(
      "https://www.google.com/maps/search/?api=1&query=Purok%203",
    );
    expect(buildDeliveryCard({ address: "", customerData: undefined })).toEqual({ mapUrl: null, lines: [] });
  });
});

describe("isDeliveryDetailRow", () => {
  it("is true for the rows the Delivery card already shows", () => {
    const data = { delivery_landmark: "Blue gate", "Note to Rider": "Call", table_number: "4" };
    expect(isDeliveryDetailRow("delivery_landmark", data)).toBe(true);
    expect(isDeliveryDetailRow("Note to Rider", data)).toBe(true);
    expect(isDeliveryDetailRow("table_number", data)).toBe(false);
  });
});
