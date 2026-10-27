import { BILLS_ROUTE, billHref, billReminderRouteFromPushData, billsHref, newBillHref } from "./bill-links";

describe("billHref", () => {
  test("opens one bill's sheet", () => {
    expect(billHref("b-1")).toBe("/(main)/expense-bills?bill=b-1");
  });

  test("encodes an id it does not trust", () => {
    expect(billHref("a&b")).toBe("/(main)/expense-bills?bill=a%26b");
  });
});

describe("newBillHref (bills-route)", () => {
  test("carries every pre-fill the editor understands", () => {
    expect(newBillHref({ categoryId: "cat-rent", amountCents: 1_500_000, day: 5, name: "Rent" })).toBe(
      "/(main)/expense-bills?new=1&category=cat-rent&amount=1500000&day=5&name=Rent",
    );
  });

  test("passes the last day of the month as 'last'", () => {
    expect(newBillHref({ day: "last" })).toBe("/(main)/expense-bills?new=1&day=last");
  });
});

describe("billReminderRouteFromPushData", () => {
  test("a reminder about one bill opens that bill", () => {
    expect(billReminderRouteFromPushData({ type: "bill_reminder", billIds: ["b-1"], url: "/(main)/expense-bills?bill=b-1" })).toBe(
      "/(main)/expense-bills?bill=b-1",
    );
  });

  test("a bundled reminder opens the list", () => {
    expect(billReminderRouteFromPushData({ type: "bill_reminder", billIds: ["b-1", "b-2"] })).toBe(BILLS_ROUTE);
  });

  test("never follows the stored url", () => {
    expect(billReminderRouteFromPushData({ type: "bill_reminder", billIds: "nope", url: "/(main)/settings" })).toBe(BILLS_ROUTE);
  });

  test("ignores other notifications", () => {
    expect(billReminderRouteFromPushData({ type: "stock_alert" })).toBeNull();
    expect(billReminderRouteFromPushData(null)).toBeNull();
    expect(billReminderRouteFromPushData("bill_reminder")).toBeNull();
  });
});

describe("billsHref", () => {
  test("one bill opens its sheet, several open the list", () => {
    expect(billsHref(["b-1"])).toBe(billHref("b-1"));
    expect(billsHref(["b-1", "b-2"])).toBe(BILLS_ROUTE);
    expect(billsHref([])).toBe(BILLS_ROUTE);
  });
});
