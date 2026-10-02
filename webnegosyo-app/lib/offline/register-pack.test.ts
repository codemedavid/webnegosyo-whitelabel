/**
 * What the register saves for offline use, and under which keys.
 *
 * The keys MUST be the ones the screens read, or the download fills a cache
 * nobody looks at and the register still has nothing offline.
 */

jest.mock("../query/use-pos-catalog", () => ({
  ...jest.requireActual("../query/use-pos-catalog"),
  fetchPosCatalog: jest.fn(),
}));
jest.mock("../query/use-register-pricing", () => ({
  ...jest.requireActual("../query/use-register-pricing"),
  fetchRegisterPricing: jest.fn(),
}));
jest.mock("../pos-catalog", () => ({ listRegisterPaymentMethods: jest.fn() }));
jest.mock("../use-outlets", () => ({ OUTLETS_RESOURCE: "outlets", fetchOutlets: jest.fn() }));
jest.mock("../tables/tables-service", () => ({
  DINING_TABLES_RESOURCE: "dining-tables",
  fetchDiningTables: jest.fn(),
}));
jest.mock("../products", () => ({ listProducts: jest.fn(), listCategories: jest.fn() }));
jest.mock("../supabase", () => ({ supabase: {} }));

import { fetchPosCatalog, posCatalogKey } from "../query/use-pos-catalog";
import { fetchRegisterPricing, registerPricingKey } from "../query/use-register-pricing";
import { tenderPaymentMethodsKey } from "../query/use-tender-payment-methods";
import { listRegisterPaymentMethods } from "../pos-catalog";
import { fetchOutlets } from "../use-outlets";
import { fetchDiningTables } from "../tables/tables-service";
import { registerPackParts, registerPackThumbnails, summarizeRegisterPack } from "./register-pack";

const SCOPE = { tenantId: "t1", paymentTenantId: "t1", outletId: "o-north" };

describe("registerPackParts", () => {
  it("saves the menu, prices and payment methods as required, under the screens' own keys", () => {
    const parts = registerPackParts(SCOPE);
    const byLabel = new Map(parts.map((part) => [part.label, part]));

    expect(byLabel.get("menu")?.key).toEqual(posCatalogKey("t1", "o-north"));
    expect(byLabel.get("prices")?.key).toEqual(registerPricingKey("t1"));
    expect(byLabel.get("payment methods")?.key).toEqual(tenderPaymentMethodsKey("t1"));
    expect(parts.filter((part) => part.isRequired).map((part) => part.label)).toEqual([
      "menu",
      "prices",
      "payment methods",
    ]);
    expect(parts.filter((part) => !part.isRequired).map((part) => part.label)).toEqual([
      "branches",
      "tables",
    ]);
  });

  it("reads each part for the scope it was built for", async () => {
    const parts = registerPackParts({ ...SCOPE, paymentTenantId: "t-imp" });
    await Promise.all(parts.map((part) => part.fetch()));

    expect(fetchPosCatalog).toHaveBeenCalledWith("t1", "o-north");
    expect(fetchRegisterPricing).toHaveBeenCalledWith("t1");
    expect(listRegisterPaymentMethods).toHaveBeenCalledWith("t-imp");
    expect(fetchOutlets).toHaveBeenCalledWith("t1");
    expect(fetchDiningTables).toHaveBeenCalledWith("t1");
  });
});

describe("summarizeRegisterPack", () => {
  it("counts what the cashier can sell from", () => {
    const values = new Map<string, unknown>([
      ["menu", { items: [{}, {}], categories: [] }],
      ["prices", { orderTypes: [{}, {}, {}], priceIndex: {} }],
      ["payment methods", [{}]],
    ]);
    expect(summarizeRegisterPack(values)).toEqual({ items: 2, orderTypes: 3, paymentMethods: 1 });
  });

  it("counts zero for a part that did not arrive", () => {
    expect(summarizeRegisterPack(new Map())).toEqual({ items: 0, orderTypes: 0, paymentMethods: 0 });
  });
});

describe("registerPackThumbnails", () => {
  it("lists each item's tile thumbnail once, skipping items without a photo", () => {
    const menu = {
      items: [
        { product: { image_url: "https://ik.imagekit.io/x/a.jpg" } },
        { product: { image_url: null } },
        { product: { image_url: "https://ik.imagekit.io/x/a.jpg" } },
      ],
      categories: [],
    };
    const urls = registerPackThumbnails(menu);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("a.jpg");
  });

  it("is empty for a value that is not a menu", () => {
    expect(registerPackThumbnails(undefined)).toEqual([]);
    expect(registerPackThumbnails({ items: "nope" })).toEqual([]);
  });
});
