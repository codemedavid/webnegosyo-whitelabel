// "Back" after a cross-link. The merchant tabs use React Navigation's default
// `firstRoute` back behaviour, so router.back() on a pushed tab screen goes
// HOME — the Drawer's Reprint and the order screen's "Printer settings" link
// left the cashier on Home instead of where she came from (QA 61). These links
// carry a `returnTo` instead of changing global navigation.
import { readFileSync } from "fs";
import { join } from "path";
import { leaveTo, parseReturnTo, withReturnTo } from "./return-to";
import { reprintOrderHref } from "./reprint-route";

const ROOT = join(__dirname, "..");
const read = (...segments: string[]) => readFileSync(join(ROOT, ...segments), "utf8");

describe("parseReturnTo", () => {
  it("accepts a path inside the merchant tabs", () => {
    expect(parseReturnTo("/(main)/pos-sales")).toBe("/(main)/pos-sales");
    expect(parseReturnTo(["/(main)/order/abc?returnTo=%2F(main)%2Fpos-sales"])).toBe(
      "/(main)/order/abc?returnTo=%2F(main)%2Fpos-sales",
    );
  });

  it("refuses anything else, so a param can never send the app off the tab tree", () => {
    for (const raw of [undefined, "", "pos-sales", "/(auth)/login", "https://evil.example", "/(main)//x", "/(main)/a\\b", 5, "/(main)/" + "x".repeat(600)]) {
      expect(parseReturnTo(raw)).toBeNull();
    }
  });
});

describe("withReturnTo", () => {
  it("adds the return path as one encoded query value", () => {
    expect(withReturnTo("/(main)/printer-settings", "/(main)/pos-sales")).toBe(
      "/(main)/printer-settings?returnTo=%2F(main)%2Fpos-sales",
    );
    expect(withReturnTo(reprintOrderHref("o1"), "/(main)/pos-sales")).toBe(
      "/(main)/order/o1?intent=reprint&returnTo=%2F(main)%2Fpos-sales",
    );
  });

  it("leaves the href alone without a return path", () => {
    expect(withReturnTo("/(main)/order/o1", null)).toBe("/(main)/order/o1");
  });
});

describe("leaveTo", () => {
  function fakeRouter() {
    return { back: jest.fn(), navigate: jest.fn(), replace: jest.fn() };
  }

  it("navigates to the return path (never replace inside the tabs)", () => {
    const router = fakeRouter();
    leaveTo(router, "/(main)/pos-sales");
    expect(router.navigate).toHaveBeenCalledWith("/(main)/pos-sales");
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });

  it("falls back to an ordinary back without one", () => {
    const router = fakeRouter();
    leaveTo(router, null);
    expect(router.back).toHaveBeenCalledTimes(1);
  });
});

describe("the cross-links carry a returnTo", () => {
  it("the Drawer's Reprint (and its other order links) come back to the Drawer", () => {
    const drawer = read("app", "(main)", "pos-sales.tsx");
    expect(drawer).toMatch(/withReturnTo\(reprintOrderHref\(sale\._id\), DRAWER_ROUTE\)/);
    expect(drawer).not.toMatch(/router\.push\(`\/\(main\)\/order\/\$\{/);
  });

  it("the order screen's Back honours returnTo, and its Printer settings link comes back to the order", () => {
    const order = read("app", "(main)", "order", "[orderId].tsx");
    expect(order).toMatch(/useReturnTo\(returnTo\)/);
    const header = order.slice(order.indexOf("<BackHeader"), order.indexOf("/>", order.indexOf("<BackHeader")));
    expect(header).toMatch(/onBack=\{leave\}/);
    expect(order).toMatch(/onOpenPrinterSettings=\{openPrinterSettings\}/);
    expect(order).toMatch(/withReturnTo\("\/\(main\)\/printer-settings", orderHrefWithReturn\)/);
  });

  it("Printer settings' Back honours returnTo", () => {
    const settings = read("app", "(main)", "printer-settings.tsx");
    expect(settings).toMatch(/useReturnTo\(returnTo\)/);
    expect(settings).toMatch(/<BackHeader[^>]*onBack=\{leave\}/);
  });

  it("the hook also takes Android's hardware back while the screen is focused", () => {
    const hook = read("hooks", "use-return-to.ts");
    expect(hook).toMatch(/useFocusEffect/);
    expect(hook).toMatch(/hardwareBackPress/);
  });
});
