import {
  canSuggestDeliveryFee,
  estimateDeliveryQuote,
  formatDistance,
  haversineDistanceKm,
  parseRoadDeliveryQuote,
  ROAD_ESTIMATE_FACTOR,
  toSuggestion,
} from "./pos-delivery-quote";
import type { DeliveryPricingSetup } from "./pos-checkout-fields";

const STORE = { lat: 14.5547, lng: 121.0244 };
/** ~3.5 km north-east of the store, as the crow flies. */
const CUSTOMER = { lat: 14.58, lng: 121.045 };

const setup = (overrides: Partial<DeliveryPricingSetup> = {}): DeliveryPricingSetup => ({
  store: STORE,
  distance: { perKm: 20, minFee: 49, radiusKm: 8 },
  freeDeliveryMin: null,
  isLalamove: false,
  ...overrides,
});

const ROAD_QUOTE = { fee: 120, distanceKm: 6, withinRadius: true, radiusKm: 8 };

describe("toSuggestion", () => {
  it("passes the store's road quote through as the suggestion", () => {
    expect(toSuggestion(ROAD_QUOTE, setup(), 300)).toEqual({
      fee: 120,
      distanceKm: 6,
      isWithinRadius: true,
      radiusKm: 8,
      isFree: false,
      isEstimate: false,
    });
  });

  it("waives the fee once the items reach the free-delivery minimum", () => {
    expect(toSuggestion(ROAD_QUOTE, setup({ freeDeliveryMin: 500 }), 500)).toMatchObject({
      fee: 0,
      isFree: true,
    });
    expect(toSuggestion(ROAD_QUOTE, setup({ freeDeliveryMin: 500 }), 499.99).fee).toBe(120);
  });
});

describe("estimateDeliveryQuote (offline stand-in)", () => {
  it("prices the straight line × the web's road factor at the store's own rate", () => {
    const roadKm = haversineDistanceKm(STORE, CUSTOMER) * ROAD_ESTIMATE_FACTOR;

    expect(estimateDeliveryQuote(setup(), CUSTOMER)).toEqual({
      fee: Math.round(roadKm * 20 * 100) / 100,
      distanceKm: roadKm,
      withinRadius: true,
      radiusKm: 8,
    });
  });

  it("never estimates below the minimum fee", () => {
    expect(estimateDeliveryQuote(setup(), { lat: 14.5548, lng: 121.0245 })?.fee).toBe(49);
  });

  it("flags — but still prices — a spot outside the delivery area", () => {
    const quote = estimateDeliveryQuote(setup({ distance: { perKm: 20, minFee: 49, radiusKm: 2 } }), CUSTOMER);
    expect(quote?.withinRadius).toBe(false);
  });

  it("estimates nothing without a pin, a store pin, distance pricing, or on a Lalamove store", () => {
    expect(estimateDeliveryQuote(setup(), null)).toBeNull();
    expect(estimateDeliveryQuote(setup({ store: null }), CUSTOMER)).toBeNull();
    expect(estimateDeliveryQuote(setup({ distance: null }), CUSTOMER)).toBeNull();
    expect(estimateDeliveryQuote(setup({ isLalamove: true }), CUSTOMER)).toBeNull();
  });
});

describe("canSuggestDeliveryFee", () => {
  it("is true only for a pinned store that prices by distance without Lalamove", () => {
    expect(canSuggestDeliveryFee(setup())).toBe(true);
    expect(canSuggestDeliveryFee(setup({ isLalamove: true }))).toBe(false);
    expect(canSuggestDeliveryFee(setup({ store: null }))).toBe(false);
  });
});

describe("parseRoadDeliveryQuote", () => {
  it("accepts the web route's answer and rejects anything malformed", () => {
    expect(parseRoadDeliveryQuote(ROAD_QUOTE)).toEqual(ROAD_QUOTE);
    expect(parseRoadDeliveryQuote({ ...ROAD_QUOTE, fee: "120" })).toBeNull();
    expect(parseRoadDeliveryQuote({ ...ROAD_QUOTE, fee: -1 })).toBeNull();
    expect(parseRoadDeliveryQuote({ ...ROAD_QUOTE, withinRadius: "yes" })).toBeNull();
    expect(parseRoadDeliveryQuote(null)).toBeNull();
  });
});

describe("formatDistance", () => {
  it("reads in metres under a kilometre and km above", () => {
    expect(formatDistance(0.853)).toBe("850 m");
    expect(formatDistance(3.24)).toBe("3.2 km");
    expect(formatDistance(12.6)).toBe("13 km");
  });
});
