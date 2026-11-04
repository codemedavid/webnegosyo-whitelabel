// The bell: who sees it, what each low-stock notice says, what counts as
// unread, and where a tapped push lands. Pure rules so the screen and the
// header button stay thin.

import {
  canSeeMerchantNotifications,
  describeStockNotification,
  describeCashNotification,
  describeNotification,
  canSeeCashNotifications,
  canOpenMerchantBell,
  formatNotificationTime,
  groupNotificationsByDay,
  nextSeenAt,
  openStockIssueCount,
  toMerchantNotification,
  unreadCount,
  type MerchantNotification,
} from "./merchant-notifications";
import { NOTIFICATIONS_ROUTE, routeFromPushData } from "./push-route";

const notice = (overrides: Partial<MerchantNotification> = {}): MerchantNotification => ({
  id: "n1",
  kind: "stock_low",
  outletId: null,
  outletName: null,
  inventoryItemId: "item-flour",
  itemName: "Flour",
  unit: "kg",
  quantity: 2.5,
  reorderLevel: 5,
  createdAt: "2026-10-12T08:00:00.000Z",
  isResolved: false,
  ...overrides,
});

const session = {
  isAuthenticated: true,
  isDemo: false,
  isOwner: false,
  isSuperadmin: false,
  impersonatedTenantId: null as string | null,
  permissions: null as string[] | null,
};

describe("canSeeMerchantNotifications", () => {
  it("shows the bell to owners and full-access admins", () => {
    expect(canSeeMerchantNotifications({ ...session, isOwner: true })).toBe(true);
    expect(canSeeMerchantNotifications(session)).toBe(true);
  });

  it("shows it to staff who can open Stock (menu permission)", () => {
    expect(canSeeMerchantNotifications({ ...session, permissions: ["orders", "menu"] })).toBe(true);
  });

  it("hides it from staff who cannot", () => {
    expect(canSeeMerchantNotifications({ ...session, permissions: ["pos", "orders"] })).toBe(false);
  });

  it("hides it in the demo and while a superadmin borrows a store", () => {
    expect(canSeeMerchantNotifications({ ...session, isDemo: true })).toBe(false);
    expect(
      canSeeMerchantNotifications({ ...session, isSuperadmin: true, impersonatedTenantId: "t1" })
    ).toBe(false);
  });

  it("hides it when signed out", () => {
    expect(canSeeMerchantNotifications({ ...session, isAuthenticated: false })).toBe(false);
  });
});

describe("describeStockNotification", () => {
  it("matches the push wording for a low ingredient", () => {
    expect(describeStockNotification(notice())).toEqual({
      title: "Flour is running low",
      body: "2.5 kg left · reorder at 5 kg",
    });
  });

  it("says out of stock, and names the branch", () => {
    expect(
      describeStockNotification(
        notice({ kind: "stock_out", quantity: 0, outletId: "o1", outletName: "North" })
      )
    ).toEqual({ title: "Flour is out of stock", body: "North · None left · reorder at 5 kg" });
  });

  it("drops the reorder line when none is set", () => {
    expect(describeStockNotification(notice({ reorderLevel: 0, quantity: 1.239 })).body).toBe(
      "1.24 kg left"
    );
  });
});

describe("toMerchantNotification", () => {
  it("reads numeric columns that arrive as strings and the alert's state", () => {
    expect(
      toMerchantNotification({
        id: "n1",
        kind: "stock_out",
        outlet_id: null,
        outlet_name: null,
        inventory_item_id: "item-flour",
        item_name: "Flour",
        unit: "kg",
        quantity: "0.0000",
        reorder_level: "5.0000",
        created_at: "2026-10-12T08:00:00.000Z",
        stock_alerts: { resolved_at: "2026-10-12T09:00:00.000Z" },
      })
    ).toEqual(notice({ kind: "stock_out", quantity: 0, isResolved: true }));
  });

  it("treats an unknown kind as low and a missing alert as still open", () => {
    const parsed = toMerchantNotification({
      id: "n1",
      kind: "something_new",
      outlet_id: null,
      outlet_name: null,
      inventory_item_id: null,
      item_name: "Flour",
      unit: null,
      quantity: null,
      reorder_level: null,
      created_at: "2026-10-12T08:00:00.000Z",
      stock_alerts: null,
    });
    expect(parsed.kind).toBe("stock_low");
    expect(parsed.isResolved).toBe(false);
  });
});

describe("unreadCount", () => {
  const items = [
    notice({ id: "a", createdAt: "2026-10-12T09:00:00.000Z" }),
    notice({ id: "b", inventoryItemId: "item-sugar", createdAt: "2026-10-12T07:00:00.000Z" }),
  ];

  it("counts everything when the list was never opened", () => {
    expect(unreadCount(items, null)).toBe(2);
  });

  it("counts only what arrived after the list was last opened", () => {
    expect(unreadCount(items, "2026-10-12T08:00:00.000Z")).toBe(1);
  });

  it("does not count a notice that has already been dealt with", () => {
    expect(unreadCount([notice({ isResolved: true })], null)).toBe(0);
  });

  it("counts a low notice and its out-of-stock escalation as one", () => {
    expect(
      unreadCount([notice({ id: "a" }), notice({ id: "b", kind: "stock_out", quantity: 0 })], null)
    ).toBe(1);
  });
});

describe("nextSeenAt", () => {
  const items = [
    notice({ id: "a", createdAt: "2026-10-12T09:00:00.000Z" }),
    notice({ id: "b", createdAt: "2026-10-12T07:00:00.000Z" }),
  ];

  it("uses the newest notice's server time, not the phone clock", () => {
    expect(nextSeenAt(items, null)).toBe("2026-10-12T09:00:00.000Z");
  });

  it("writes nothing when there is nothing newer, or nothing at all", () => {
    expect(nextSeenAt(items, "2026-10-12T09:00:00.000Z")).toBeNull();
    expect(nextSeenAt([], null)).toBeNull();
  });
});

describe("openStockIssueCount", () => {
  it("counts each ingredient on each shelf once, and only while it still needs restocking", () => {
    expect(
      openStockIssueCount([
        // A low notice and its later escalation are one problem.
        notice({ id: "a", kind: "stock_low" }),
        notice({ id: "b", kind: "stock_out" }),
        notice({ id: "c", outletId: "north" }),
        notice({ id: "d", inventoryItemId: "item-sugar", isResolved: true }),
      ])
    ).toBe(2);
  });
});

describe("groupNotificationsByDay", () => {
  it("splits into Today and Earlier on the phone's calendar, newest first", () => {
    const now = new Date(2026, 9, 12, 15, 0);
    const today = new Date(2026, 9, 12, 9, 0).toISOString();
    const todayLater = new Date(2026, 9, 12, 11, 0).toISOString();
    const yesterday = new Date(2026, 9, 11, 22, 0).toISOString();

    const groups = groupNotificationsByDay(
      [
        notice({ id: "y", createdAt: yesterday }),
        notice({ id: "t1", createdAt: today }),
        notice({ id: "t2", createdAt: todayLater }),
      ],
      now
    );

    expect(groups.map((g) => [g.title, g.items.map((i) => i.id)])).toEqual([
      ["Today", ["t2", "t1"]],
      ["Earlier", ["y"]],
    ]);
  });

  it("leaves out empty groups", () => {
    expect(groupNotificationsByDay([], new Date())).toEqual([]);
  });
});

describe("formatNotificationTime", () => {
  const now = new Date(2026, 9, 12, 15, 0);

  it("reads recent times relatively", () => {
    expect(formatNotificationTime(new Date(2026, 9, 12, 14, 59, 40).toISOString(), now)).toBe("Just now");
    expect(formatNotificationTime(new Date(2026, 9, 12, 14, 35).toISOString(), now)).toBe("25m ago");
    expect(formatNotificationTime(new Date(2026, 9, 12, 12, 0).toISOString(), now)).toBe("3h ago");
  });

  it("reads older times as a date", () => {
    expect(formatNotificationTime(new Date(2026, 9, 11, 9, 0).toISOString(), now)).toBe("Yesterday");
    expect(formatNotificationTime(new Date(2026, 9, 3, 9, 0).toISOString(), now)).toBe("Oct 3");
  });
});

describe("routeFromPushData", () => {
  it("opens the ingredient a single stock push is about", () => {
    expect(routeFromPushData({ type: "stock_alert", inventoryItemId: "item-flour" })).toBe(
      "/(main)/ingredient/item-flour"
    );
  });

  it("opens the bell's list for a batch", () => {
    expect(routeFromPushData({ type: "stock_alert" })).toBe(NOTIFICATIONS_ROUTE);
  });

  it("still routes What's New pushes", () => {
    expect(routeFromPushData({ announcementId: "a1", kind: "post" })).toBe("/(main)/whats-new/a1");
  });

  it("opens Bills to pay from a bill reminder: one bill opens its sheet, a bundle the list", () => {
    expect(routeFromPushData({ type: "bill_reminder", billIds: ["bill-rent"] })).toBe("/(main)/expense-bills?bill=bill-rent");
    expect(routeFromPushData({ type: "bill_reminder", billIds: ["bill-rent", "bill-power"] })).toBe("/(main)/expense-bills");
  });

  it("ignores pushes it does not know, like new orders", () => {
    expect(routeFromPushData({ orderId: "o1" })).toBeNull();
    expect(routeFromPushData(null)).toBeNull();
  });
});

describe("cash notices (CONTRACTS W3.3)", () => {
  const cash = (patch: Record<string, unknown>) =>
    toMerchantNotification({
      id: "c1",
      kind: "shift_overdue",
      outlet_id: null,
      outlet_name: null,
      inventory_item_id: null,
      item_name: "Ben Cruz",
      unit: null,
      quantity: null,
      reorder_level: null,
      created_at: "2026-10-25T00:30:00.000Z",
      stock_alerts: null,
      shift_id: "s2",
      remittance_id: null,
      drawer_name: "Cashier 2",
      cash_cents: null,
      ...patch,
    } as never);

  it("words a shift left open", () => {
    expect(describeCashNotification(cash({}))).toEqual({ title: "Ben's shift is still open", body: "Cashier 2 · End it from the Drawer" });
    expect(describeCashNotification(cash({ outlet_id: "o1", outlet_name: "North", drawer_name: null })).body).toBe("North · End it from the Drawer");
  });

  it("words cash waiting to be accepted, amount or not", () => {
    const waiting = cash({ kind: "remittance_pending", item_name: "Ana Reyes", remittance_id: "r1", cash_cents: "634500" });
    expect(describeCashNotification(waiting)).toEqual({ title: "Ana's ₱6,345 is waiting to be accepted", body: "Cashier 2 · Accept it in Remittances" });
    expect(describeCashNotification({ ...waiting, cashCents: 634550 }).title).toBe("Ana's ₱6,345.50 is waiting to be accepted");
    expect(describeCashNotification({ ...waiting, cashCents: null }).title).toBe("Ana's remittance is waiting to be accepted");
    expect(describeNotification(waiting)).toEqual(describeCashNotification(waiting));
  });

  it("keeps the kind and the links, and never counts as a stock issue", () => {
    const n = cash({});
    expect(n).toMatchObject({ kind: "shift_overdue", shiftId: "s2", drawerName: "Cashier 2" });
    expect(openStockIssueCount([n])).toBe(0);
    expect(unreadCount([n, { ...n, id: "c2" }], null)).toBe(2);
  });

  it("shows cash notices to whoever receives cash; the bell opens for either kind", () => {
    const base = { isAuthenticated: true, isDemo: false, isOwner: false, isSuperadmin: false, impersonatedTenantId: null };
    expect(canSeeCashNotifications({ ...base, permissions: ["cash_manage"] })).toBe(true);
    expect(canSeeCashNotifications({ ...base, permissions: ["menu"] })).toBe(false);
    expect(canOpenMerchantBell({ ...base, permissions: ["cash_manage"] })).toBe(true);
    expect(canOpenMerchantBell({ ...base, permissions: ["pos"] })).toBe(false);
    expect(canSeeCashNotifications({ ...base, isDemo: true, isOwner: true, permissions: null })).toBe(false);
  });
});

describe("routeFromPushData — cash alerts", () => {
  it("opens where each cash notice is acted on", () => {
    expect(routeFromPushData({ type: "cash_alert", kind: "shift_overdue", shiftId: "s2" })).toBe("/(main)/pos-sales");
    expect(routeFromPushData({ type: "cash_alert", kind: "remittance_pending", remittanceId: "r1" })).toBe("/(main)/remittances");
    expect(routeFromPushData({ type: "cash_alert", kind: "something_new" })).toBe(NOTIFICATIONS_ROUTE);
  });
});
