import { isCustomerHubOn, selectIsCustomerHubOn } from "./availability";

describe("isCustomerHubOn", () => {
  it("is on for every platform store, whatever the switch says", () => {
    expect(isCustomerHubOn({ customer_hub_enabled: false, order_backend: "platform" })).toBe(true);
    expect(isCustomerHubOn({ customer_hub_enabled: null })).toBe(true);
  });

  it("needs the switch for a store whose orders live in its own Convex", () => {
    const convex = { order_backend: "convex" as const, convex_deployment_url: "https://x.convex.cloud" };
    expect(isCustomerHubOn({ ...convex, customer_hub_enabled: false })).toBe(false);
    expect(isCustomerHubOn({ ...convex, customer_hub_enabled: true })).toBe(true);
  });
});

describe("selectIsCustomerHubOn", () => {
  it("reads a platform session as on even if its stored flag is stale", () => {
    expect(selectIsCustomerHubOn({ customerHubEnabled: false, orderBackend: "platform" })).toBe(true);
    expect(selectIsCustomerHubOn({ customerHubEnabled: false, orderBackend: "convex" })).toBe(false);
    expect(selectIsCustomerHubOn({ customerHubEnabled: true, orderBackend: "convex" })).toBe(true);
  });
});
