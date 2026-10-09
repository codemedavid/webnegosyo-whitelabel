import {
  fetchDeliveryQuote,
  googleMapsUrl,
  placeAddressText,
  searchAddresses,
} from "./address-search";

jest.mock("../authorized-post", () => ({ getAccessTokenBounded: jest.fn(async () => "token") }));
jest.mock("../web-app-url", () => ({ getWebAppUrl: () => "https://www.webnegosyo.com" }));

const fetchMock = jest.fn();
const originalFetch = global.fetch;

function respond(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce({ ok: status >= 200 && status < 300, status, json: async () => body });
}

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe("searchAddresses", () => {
  it("posts the search as the signed-in cashier and keeps only usable places", async () => {
    respond(200, {
      places: [
        { name: "SM North EDSA", address: "North Ave, Quezon City", lat: 14.6566, lng: 121.0298 },
        { name: "Broken", address: "No coordinates" },
        { name: null, address: "", lat: 1, lng: 2 },
      ],
    });

    const result = await searchAddresses("t1", " SM North ", { lat: 14.6, lng: 121 });

    expect(result).toEqual({
      ok: true,
      value: [{ name: "SM North EDSA", address: "North Ave, Quezon City", location: { lat: 14.6566, lng: 121.0298 } }],
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://www.webnegosyo.com/api/maps/places");
    expect(init.headers.Authorization).toBe("Bearer token");
    expect(JSON.parse(init.body)).toEqual({ tenantId: "t1", query: "SM North", near: { lat: 14.6, lng: 121 } });
  });

  it("reports 'busy' on a rate limit and 'offline' when the network fails", async () => {
    respond(429, { error: "Too many" });
    expect(await searchAddresses("t1", "SM North", null)).toEqual({ ok: false, reason: "busy" });

    fetchMock.mockRejectedValueOnce(new TypeError("Network request failed"));
    expect(await searchAddresses("t1", "SM North", null)).toEqual({ ok: false, reason: "offline" });
  });
});

describe("fetchDeliveryQuote", () => {
  it("returns the store's road quote", async () => {
    respond(200, { fee: 90, distanceKm: 6, withinRadius: true, radiusKm: 10 });
    expect(await fetchDeliveryQuote("t1", { lat: 14.6, lng: 121 })).toEqual({
      ok: true,
      value: { fee: 90, distanceKm: 6, withinRadius: true, radiusKm: 10 },
    });
  });

  it("treats a malformed answer as unavailable rather than billing it", async () => {
    respond(200, { fee: "lots" });
    expect(await fetchDeliveryQuote("t1", { lat: 14.6, lng: 121 })).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("placeAddressText", () => {
  const at = { lat: 1, lng: 2 };

  it("leads with a landmark's name when its address leaves it out", () => {
    expect(placeAddressText({ name: "SM North EDSA", address: "North Ave, Quezon City", location: at })).toBe(
      "SM North EDSA, North Ave, Quezon City",
    );
  });

  it("does not repeat a name the address already starts with", () => {
    expect(placeAddressText({ name: "12 Rizal St", address: "12 Rizal St, Manila", location: at })).toBe(
      "12 Rizal St, Manila",
    );
  });
});

describe("googleMapsUrl", () => {
  it("opens the exact pin when there is one, else searches the typed address", () => {
    expect(googleMapsUrl("x", { lat: 14.5, lng: 121 })).toBe(
      "https://www.google.com/maps/search/?api=1&query=14.5%2C121",
    );
    expect(googleMapsUrl("Blk 5 Lot 2, Imus", null)).toBe(
      "https://www.google.com/maps/search/?api=1&query=Blk%205%20Lot%202%2C%20Imus",
    );
    expect(googleMapsUrl("  ", null)).toBeNull();
  });
});
