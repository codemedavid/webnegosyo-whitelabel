import {
  customFieldsFor,
  fieldRole,
  toDeliveryPricing,
  toPosCheckoutField,
} from "./pos-checkout-fields";

jest.mock("./supabase", () => ({ supabase: {} }));

const row = (overrides: Partial<Parameters<typeof toPosCheckoutField>[0]> = {}) => ({
  id: "f1",
  order_type_id: "ot-delivery",
  field_name: "Landmark",
  field_label: "Nearest landmark",
  field_type: "text",
  placeholder: null,
  options: [],
  ...overrides,
});

describe("fieldRole", () => {
  it("maps the seeded internal names onto the register's own controls", () => {
    expect(fieldRole("customer_name")).toBe("name");
    expect(fieldRole("customer_phone")).toBe("phone");
    expect(fieldRole("delivery_address")).toBe("address");
    expect(fieldRole("table_number")).toBe("table");
  });

  it("recognises the words merchants typed for the same questions", () => {
    expect(fieldRole("Contact Number ")).toBe("phone");
    expect(fieldRole("Full name")).toBe("name");
    expect(fieldRole("Delivery Address")).toBe("address");
    expect(fieldRole("Table  Number")).toBe("table");
  });

  it("leaves everything else as a custom question", () => {
    expect(fieldRole("Landmark")).toBe("custom");
    expect(fieldRole("Preffered Time ")).toBe("custom");
  });
});

describe("toPosCheckoutField", () => {
  it("keeps a dropdown's choices", () => {
    const field = toPosCheckoutField(row({ field_type: "select", options: ["Monreal", " San Jacinto ", 3] }));
    expect(field).toMatchObject({ type: "select", options: ["Monreal", "San Jacinto"], role: "custom" });
  });

  it("asks a dropdown with no choices as text, since it cannot be answered otherwise", () => {
    expect(toPosCheckoutField(row({ field_type: "select", options: [] }))?.type).toBe("text");
  });

  it("falls back to the field name when the label is blank, and to text for unknown types", () => {
    const field = toPosCheckoutField(row({ field_label: "  ", field_type: "date" }));
    expect(field).toMatchObject({ label: "Landmark", type: "text" });
  });

  it("drops a field with no name — there is no key to store its answer under", () => {
    expect(toPosCheckoutField(row({ field_name: "  " }))).toBeNull();
  });
});

describe("customFieldsFor", () => {
  const fields = [
    toPosCheckoutField(row({ id: "a", field_name: "customer_name" }))!,
    toPosCheckoutField(row({ id: "b", field_name: "Landmark" }))!,
    toPosCheckoutField(row({ id: "c", field_name: "Notes", order_type_id: "ot-dine" }))!,
  ];

  it("returns only the custom questions of the chosen order type", () => {
    expect(customFieldsFor(fields, "ot-delivery").map((field) => field.id)).toEqual(["b"]);
    expect(customFieldsFor(fields, "ot-dine").map((field) => field.id)).toEqual(["c"]);
  });

  it("returns nothing before an order type is chosen", () => {
    expect(customFieldsFor(fields, null)).toEqual([]);
  });
});

describe("toDeliveryPricing", () => {
  const tenant = {
    restaurant_latitude: "14.55",
    restaurant_longitude: 121.02,
    distance_delivery_enabled: true,
    delivery_price_per_km: "15",
    delivery_min_fee: 50,
    delivery_radius_km: 8,
    free_delivery_min_order: null,
    lalamove_enabled: false,
  };

  it("reads the store pin and distance pricing, numeric strings included", () => {
    expect(toDeliveryPricing(tenant)).toEqual({
      store: { lat: 14.55, lng: 121.02 },
      distance: { perKm: 15, minFee: 50, radiusKm: 8 },
      freeDeliveryMin: null,
      isLalamove: false,
    });
  });

  it("switches distance pricing off when it is disabled or incomplete", () => {
    expect(toDeliveryPricing({ ...tenant, distance_delivery_enabled: false }).distance).toBeNull();
    expect(toDeliveryPricing({ ...tenant, delivery_radius_km: 0 }).distance).toBeNull();
    expect(toDeliveryPricing({ ...tenant, delivery_price_per_km: null }).distance).toBeNull();
  });

  it("treats a 0,0 store pin as unset", () => {
    expect(toDeliveryPricing({ ...tenant, restaurant_latitude: 0, restaurant_longitude: 0 }).store).toBeNull();
  });
});
