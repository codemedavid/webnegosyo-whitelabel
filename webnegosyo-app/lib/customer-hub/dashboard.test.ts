import {
  bringBackActions,
  changeRatio,
  customerLabel,
  lastVisitLabel,
  describeKnownBuyers,
  leverTiles,
  revenueSegments,
  selectDashboardWindow,
  type CustomerDashboard,
  type DashboardWindow,
} from "./dashboard";

function windowOf(overrides: Partial<DashboardWindow> = {}): DashboardWindow {
  return {
    days: 30,
    revenue: { total: 10_000, returning: 4_000, new: 1_000, unknown: 5_000 },
    previousRevenue: 8_000,
    orders: 100,
    previousOrders: 80,
    knownOrders: 40,
    customers: 30,
    previousCustomers: 20,
    returningCustomers: 12,
    newCustomers: 18,
    repeatRate: 40,
    previousRepeatRate: 30,
    oneTimers: 9,
    favourites: { returning: [], new: [] },
    topCustomers: [],
    ...overrides,
  };
}

function dashboardOf(overrides: Partial<CustomerDashboard> = {}): CustomerDashboard {
  return {
    windows: [windowOf({ days: 7 }), windowOf(), windowOf({ days: 90 })],
    slipping: 4,
    lapsed: 6,
    lifetimeValue: { regular: 4200, oneTime: 380 },
    tillComplete: true,
    ...overrides,
  };
}

describe("selectDashboardWindow", () => {
  it("finds the window the merchant picked", () => {
    expect(selectDashboardWindow(dashboardOf(), 90)?.days).toBe(90);
    expect(selectDashboardWindow(dashboardOf(), 14)).toBeNull();
  });
});

describe("changeRatio", () => {
  it("is a fraction of the earlier figure, and null with nothing to compare", () => {
    expect(changeRatio(120, 100)).toBeCloseTo(0.2);
    expect(changeRatio(50, 0)).toBeNull();
  });
});

describe("revenueSegments", () => {
  it("splits the money into regulars, first-timers and unnamed orders", () => {
    expect(revenueSegments(windowOf(), true)).toEqual([
      { key: "returning", label: "Regulars", amount: 4_000, share: 0.4 },
      { key: "new", label: "First-timers", amount: 1_000, share: 0.1 },
      { key: "unknown", label: "Unnamed", amount: 5_000, share: 0.5 },
    ]);
  });

  it("leaves out the unnamed share where the till is not fully visible", () => {
    const segments = revenueSegments(windowOf({ revenue: { total: 5_000, returning: 4_000, new: 1_000, unknown: 0 } }), false);

    expect(segments.map((segment) => segment.key)).toEqual(["returning", "new"]);
    expect(segments[0].share).toBeCloseTo(0.8);
  });

  it("draws nothing for a window without sales", () => {
    expect(revenueSegments(windowOf({ revenue: { total: 0, returning: 0, new: 0, unknown: 0 } }), true)).toEqual([]);
  });
});

describe("leverTiles", () => {
  it("shows customers, how many came back and spend per order, each against the last window", () => {
    const [customers, cameBack, spend] = leverTiles(windowOf());

    expect(customers).toMatchObject({ label: "Customers", value: "30", change: { kind: "ratio", value: 0.5 } });
    expect(cameBack).toMatchObject({ label: "Came back", value: "40%", change: { kind: "points", value: 10 } });
    expect(spend.label).toBe("Spend per order");
    expect(spend.value).toBe("₱100");
    expect(spend.change).toEqual({ kind: "ratio", value: 0 });
  });

  it("has no spend per order and no change when there were no orders", () => {
    const spend = leverTiles(windowOf({ orders: 0, previousOrders: 0, revenue: { total: 0, returning: 0, new: 0, unknown: 0 } }))[2];

    expect(spend.value).toBe("—");
    expect(spend.change).toBeNull();
  });
});

describe("describeKnownBuyers", () => {
  it("says how many buyers the store can name, and why it matters, when that is few", () => {
    const known = describeKnownBuyers(windowOf({ knownOrders: 12, orders: 100 }), dashboardOf());

    expect(known).toMatchObject({ percent: 12, tone: "poor" });
    expect(known?.headline).toBe("You know 12% of your buyers");
    expect(known?.advice).toContain("₱4,200");
    expect(known?.advice).toContain("₱380");
  });

  it("praises a store that names most of its buyers", () => {
    expect(describeKnownBuyers(windowOf({ knownOrders: 80, orders: 100 }), dashboardOf())?.tone).toBe("good");
  });

  it("stays silent where the unnamed share cannot be known, or nothing sold", () => {
    expect(describeKnownBuyers(windowOf(), dashboardOf({ tillComplete: false }))).toBeNull();
    expect(describeKnownBuyers(windowOf({ orders: 0, knownOrders: 0 }), dashboardOf())).toBeNull();
  });
});

describe("bringBackActions", () => {
  const rewards = { hasActiveProgram: true, members: 40, rewardsWaiting: 3 };

  it("leads with the guests slipping away, then the quiet ones, then one-timers, then rewards", () => {
    const actions = bringBackActions({ dashboard: dashboardOf(), window: windowOf(), canText: true, rewards });

    expect(actions.map((action) => action.key)).toEqual(["slipping", "lapsed", "one_timers", "rewards"]);
    expect(actions[0]).toMatchObject({
      title: "4 regulars are slipping away",
      cta: "Text them",
      target: { kind: "campaign", preset: "slipping_regulars" },
    });
    expect(actions[1].target).toEqual({ kind: "campaign", preset: "win_back" });
    expect(actions[2]).toMatchObject({ title: "9 guests came once", target: { kind: "campaign", preset: "second_visit" } });
    expect(actions[3]).toMatchObject({ title: "3 rewards are waiting", target: { kind: "loyalty" } });
  });

  it("drops what is empty and speaks in the singular for one", () => {
    const actions = bringBackActions({
      dashboard: dashboardOf({ slipping: 1, lapsed: 0 }),
      window: windowOf({ oneTimers: 0 }),
      canText: true,
      rewards: null,
    });

    expect(actions.map((action) => action.title)).toEqual(["1 regular is slipping away"]);
  });

  it("opens the guest list instead of a text where this phone cannot send", () => {
    const [first] = bringBackActions({ dashboard: dashboardOf(), window: windowOf(), canText: false, rewards: null });

    expect(first).toMatchObject({ cta: "See guests", target: { kind: "guests" } });
  });

  it("offers to start a reward card when the store has none", () => {
    const actions = bringBackActions({
      dashboard: dashboardOf({ slipping: 0, lapsed: 0 }),
      window: windowOf({ oneTimers: 0 }),
      canText: true,
      rewards: { hasActiveProgram: false, members: 0, rewardsWaiting: 0 },
    });

    expect(actions).toEqual([
      expect.objectContaining({ key: "rewards", title: "Start a reward card", cta: "Set up", target: { kind: "loyalty" } }),
    ]);
  });

  it("counts members when no reward is waiting", () => {
    const actions = bringBackActions({
      dashboard: dashboardOf({ slipping: 0, lapsed: 0 }),
      window: windowOf({ oneTimers: 0 }),
      canText: true,
      rewards: { hasActiveProgram: true, members: 1, rewardsWaiting: 0 },
    });

    expect(actions[0]).toMatchObject({ title: "1 member is collecting stamps", cta: "Open" });
  });
});

describe("customerLabel", () => {
  it("prefers the saved name, then the last digits of the number", () => {
    const base = { key: "k", customerId: null, visits: 1, spend: 1, lastVisitAt: "" };
    expect(customerLabel({ ...base, name: "Ana Reyes", phoneTail: "1234" })).toBe("Ana Reyes");
    expect(customerLabel({ ...base, name: null, phoneTail: "1234" })).toBe("Guest ending 1234");
    expect(customerLabel({ ...base, name: null, phoneTail: null })).toBe("Guest");
  });
});

describe("lastVisitLabel", () => {
  const now = Date.parse("2026-09-30T12:00:00.000Z");

  it("says today, yesterday, or how many days ago", () => {
    expect(lastVisitLabel("2026-09-30T08:00:00.000Z", now)).toBe("Last visit today");
    expect(lastVisitLabel("2026-09-29T08:00:00.000Z", now)).toBe("Last visit yesterday");
    expect(lastVisitLabel("2026-09-20T08:00:00.000Z", now)).toBe("Last visit 10 days ago");
  });

  it("says nothing for a date it cannot read", () => {
    expect(lastVisitLabel("not a date", now)).toBe("");
  });
});
