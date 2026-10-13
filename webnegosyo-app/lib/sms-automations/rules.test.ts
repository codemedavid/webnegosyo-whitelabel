import {
  dailyLimitChoices,
  guestCapChoices,
  quietHourChoices,
  reviewUrlProblem,
  sameRules,
  withQuietHours,
} from "./rules";
import { keepsStatus, serverStatusFor, showsReason, statusTone } from "./activity";
import type { TextingRules } from "./api";

const RULES: TextingRules = {
  quietHoursStart: "21:00", quietHoursEnd: "08:00", guestCapDays: 3, dailyLimit: 100, optOutLine: null, reviewUrl: null,
};

describe("texting rule choices", () => {
  it("offers a few sensible quiet windows, keeping the store's own", () => {
    expect(quietHourChoices(RULES).map((c) => c.label)).toEqual(["9pm–8am", "10pm–7am", "8pm–9am"]);
    expect(quietHourChoices({ ...RULES, quietHoursStart: "23:00", quietHoursEnd: "06:30" }).map((c) => c.label))
      .toEqual(["9pm–8am", "10pm–7am", "8pm–9am", "11pm–6:30am"]);
    expect(withQuietHours(RULES, "22:00-07:00")).toEqual({ ...RULES, quietHoursStart: "22:00", quietHoursEnd: "07:00" });
  });

  it("offers caps and limits in plain words", () => {
    expect(guestCapChoices(3).map((c) => c.label)).toEqual(["1 day", "2 days", "3 days", "5 days", "7 days"]);
    expect(guestCapChoices(10).map((c) => c.value)).toEqual([1, 2, 3, 5, 7, 10]);
    expect(dailyLimitChoices(100).map((c) => c.label)).toEqual(["25 a day", "50 a day", "100 a day", "200 a day"]);
  });

  it("accepts only a full https review link, or none", () => {
    expect(reviewUrlProblem("")).toBeNull();
    expect(reviewUrlProblem("https://g.page/r/abc/review")).toBeNull();
    expect(reviewUrlProblem("http://g.page/r/abc")).toBe("Paste the full review link, starting with https://");
    expect(reviewUrlProblem("g.page/r/abc")).not.toBeNull();
    expect(reviewUrlProblem("https://localhost")).not.toBeNull();
    expect(reviewUrlProblem("https://g.page/r/a b")).not.toBeNull();
  });

  it("compares rules the way the save button needs", () => {
    expect(sameRules(RULES, { ...RULES, reviewUrl: "" })).toBe(true);
    expect(sameRules(RULES, { ...RULES, dailyLimit: 50 })).toBe(false);
  });
});

describe("activity filters", () => {
  it("asks the server for one status where it can", () => {
    expect(serverStatusFor("waiting")).toBe("queued");
    expect(serverStatusFor("sent")).toBe("sent");
    expect(serverStatusFor("not_sent")).toBeUndefined();
    expect(serverStatusFor("all")).toBeUndefined();
  });

  it("keeps only texts that did not go out under Not sent", () => {
    expect(keepsStatus("not_sent", "skipped")).toBe(true);
    expect(keepsStatus("not_sent", "expired")).toBe(true);
    expect(keepsStatus("not_sent", "sent")).toBe(false);
    expect(keepsStatus("waiting", "claimed")).toBe(true);
    expect(showsReason("failed")).toBe(true);
    expect(showsReason("queued")).toBe(false);
    expect(statusTone("sent")).toBe("good");
    expect(statusTone("failed")).toBe("bad");
  });
});
