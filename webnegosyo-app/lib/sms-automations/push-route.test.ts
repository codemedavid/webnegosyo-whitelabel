import { textingRouteFromPushData } from "./push-route";

describe("textingRouteFromPushData", () => {
  it("opens Texts for the texts-waiting push", () => {
    expect(textingRouteFromPushData({ kind: "sms_texts_waiting" })).toBe("/(main)/texts");
  });

  it("opens the campaign a send reminder is about", () => {
    expect(textingRouteFromPushData({ campaignId: "c-1" })).toBe("/(main)/campaign/c-1");
  });

  it("leaves every other notification alone", () => {
    expect(textingRouteFromPushData(null)).toBeNull();
    expect(textingRouteFromPushData("x")).toBeNull();
    expect(textingRouteFromPushData({ orderId: "o-1" })).toBeNull();
    expect(textingRouteFromPushData({ campaignId: "" })).toBeNull();
    expect(textingRouteFromPushData({ kind: "stock_low" })).toBeNull();
  });
});
