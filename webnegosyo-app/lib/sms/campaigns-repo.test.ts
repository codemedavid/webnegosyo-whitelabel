/**
 * Persistence for campaigns, runs and sends.
 *
 * The load-bearing test here is the claim. `claimRun` must be a CONDITIONAL
 * write — update ... where claimed_by_device is null — so that when the owner's
 * phone and the branch tablet both see a run come due, exactly one of them
 * proceeds. A read-then-write would let both read null and both send, texting
 * every guest twice. That race cannot be reproduced in a unit test, so what is
 * pinned instead is the shape of the query.
 */

const calls: { method: string; args: unknown[] }[] = [];
let queued: { data: unknown; error: unknown }[] = [];

function nextResult(): { data: unknown; error: unknown } {
  return queued.shift() ?? { data: [], error: null };
}

jest.mock("../supabase", () => {
  const makeChain = () => {
    const chain: Record<string, unknown> = {};
    for (const method of [
      "select",
      "insert",
      "update",
      "upsert",
      "eq",
      "is",
      "in",
      "order",
      "limit",
      "single",
      "maybeSingle",
    ]) {
      chain[method] = (...args: unknown[]) => {
        calls.push({ method, args });
        return chain;
      };
    }
    chain.then = (resolve: (value: unknown) => unknown) => resolve(nextResult());
    return chain;
  };
  return {
    supabase: {
      from: (table: string) => {
        calls.push({ method: "from", args: [table] });
        return makeChain();
      },
    },
  };
});

import { EMPTY_CAMPAIGN_DRAFT } from "./campaign-form";
import {
  claimRun,
  createCampaign,
  ensureRun,
  lastRunAtByCampaign,
  listCampaignRows,
  updateCampaign,
  finishRun,
  listSentCustomerIds,
  recordSend,
  setCampaignStatus,
  toScheduledCampaign,
} from "./campaigns-repo";

beforeEach(() => {
  calls.length = 0;
  queued = [];
});

function argsFor(method: string): unknown[][] {
  return calls.filter((c) => c.method === method).map((c) => c.args);
}

describe("claimRun — only one device may work a run", () => {
  it("claims only while the run is unclaimed", async () => {
    queued = [{ data: [{ id: "run-1" }], error: null }];

    await claimRun("run-1", "device-A");

    // The `is(claimed_by_device, null)` predicate IS the lock. Without it this
    // becomes a read-then-write and both devices win.
    expect(argsFor("is")).toContainEqual(["claimed_by_device", null]);
    expect(argsFor("eq")).toContainEqual(["id", "run-1"]);
  });

  it("stamps the device and the time it took the run", async () => {
    queued = [{ data: [{ id: "run-1" }], error: null }];

    await claimRun("run-1", "device-A");

    const [[patch]] = argsFor("update") as [[Record<string, unknown>]];
    expect(patch.claimed_by_device).toBe("device-A");
    expect(typeof patch.claimed_at).toBe("string");
  });

  it("succeeds when the conditional update changed a row", async () => {
    queued = [{ data: [{ id: "run-1" }], error: null }];

    await expect(claimRun("run-1", "device-A")).resolves.toBe(true);
  });

  it("fails when another device got there first and no row changed", async () => {
    queued = [{ data: [], error: null }];

    await expect(claimRun("run-1", "device-B")).resolves.toBe(false);
  });

  it("fails closed when the claim errors, rather than sending anyway", async () => {
    queued = [{ data: null, error: { message: "offline" } }];

    await expect(claimRun("run-1", "device-A")).resolves.toBe(false);
  });
});

describe("createCampaign — a saved campaign must be able to send", () => {
  it("saves it live rather than leaving it as a silent draft", async () => {
    // The column default is `draft`, and `computeCampaignDueStates` only ever
    // marks an ACTIVE campaign due. So a campaign written without a status sits
    // there forever: it never comes due, never raises a reminder, never sends —
    // and nothing on the screen says why. The merchant filled in a schedule;
    // that IS the intent to run it.
    queued = [{ data: { id: "c-1" }, error: null }];

    await createCampaign("t-1", EMPTY_CAMPAIGN_DRAFT);

    const [[row]] = argsFor("insert") as [[Record<string, unknown>]];
    expect(row.status).toBe("active");
  });

  it("still scopes the insert to the tenant", async () => {
    queued = [{ data: { id: "c-1" }, error: null }];

    await createCampaign("t-1", EMPTY_CAMPAIGN_DRAFT);

    const [[row]] = argsFor("insert") as [[Record<string, unknown>]];
    expect(row.tenant_id).toBe("t-1");
  });

  it("hands back the new id, so the editor can stay on what was just made", async () => {
    // Without the id the screen has nowhere to go but back to the list — and
    // the Send block only renders for a campaign that has one.
    queued = [{ data: { id: "c-1" }, error: null }];

    await expect(createCampaign("t-1", EMPTY_CAMPAIGN_DRAFT)).resolves.toBe("c-1");
  });

  it("throws when the insert fails, rather than reporting a save that did not happen", async () => {
    queued = [{ data: null, error: { message: "denied" } }];

    await expect(createCampaign("t-1", EMPTY_CAMPAIGN_DRAFT)).rejects.toThrow("denied");
  });
});

describe("listSentCustomerIds — the resume set", () => {
  it("returns who has already been texted in this run", async () => {
    queued = [{ data: [{ customer_id: "c1" }, { customer_id: "c2" }], error: null }];

    await expect(listSentCustomerIds("run-1")).resolves.toEqual(["c1", "c2"]);
  });

  it("throws on failure — an empty list here would re-text everyone", async () => {
    queued = [{ data: null, error: { message: "network" } }];

    await expect(listSentCustomerIds("run-1")).rejects.toThrow("network");
  });

  it("ignores rows with no customer id", async () => {
    queued = [{ data: [{ customer_id: "c1" }, { customer_id: null }], error: null }];

    await expect(listSentCustomerIds("run-1")).resolves.toEqual(["c1"]);
  });
});

describe("recordSend", () => {
  it("writes the audit row against the run", async () => {
    queued = [{ data: null, error: null }];

    await recordSend("tenant-1", "run-1", {
      customerId: "c1",
      phoneE164: "+639171234567",
      messageBody: "Hi Maria",
      result: "sent",
      sentAt: "2026-08-20T02:00:00.000Z",
    });

    const [[row]] = argsFor("insert") as [[Record<string, unknown>]];
    expect(row.tenant_id).toBe("tenant-1");
    expect(row.run_id).toBe("run-1");
    expect(row.customer_id).toBe("c1");
    expect(row.result).toBe("sent");
    expect(row.message_body).toBe("Hi Maria");
  });

  it("throws when the write fails, so the run halts instead of double-sending", async () => {
    queued = [{ data: null, error: { message: "offline" } }];

    await expect(
      recordSend("tenant-1", "run-1", {
        customerId: "c1",
        phoneE164: "+639171234567",
        messageBody: "Hi",
        result: "sent",
        sentAt: "2026-08-20T02:00:00.000Z",
      })
    ).rejects.toThrow("offline");
  });
});

describe("finishRun", () => {
  it("stamps completion for a fully-worked run", async () => {
    queued = [{ data: null, error: null }];

    await finishRun("run-1", "completed");

    const [[patch]] = argsFor("update") as [[Record<string, unknown>]];
    expect(patch.status).toBe("completed");
    expect(typeof patch.completed_at).toBe("string");
  });

  it("leaves a partial run open, with no completion timestamp", async () => {
    // A partial run still has recipients waiting; stamping it completed would
    // retire it and strand them.
    queued = [{ data: null, error: null }];

    await finishRun("run-1", "partial");

    const [[patch]] = argsFor("update") as [[Record<string, unknown>]];
    expect(patch.status).toBe("pending");
    expect(patch.completed_at).toBeNull();
  });
});

describe("setCampaignStatus", () => {
  it("updates just the one campaign", async () => {
    queued = [{ data: null, error: null }];

    await setCampaignStatus("camp-1", "paused");

    expect(argsFor("eq")).toContainEqual(["id", "camp-1"]);
    const [[patch]] = argsFor("update") as [[Record<string, unknown>]];
    expect(patch.status).toBe("paused");
  });

  it("throws when the write fails", async () => {
    queued = [{ data: null, error: { message: "denied" } }];

    await expect(setCampaignStatus("camp-1", "active")).rejects.toThrow("denied");
  });
});

describe("toScheduledCampaign — row to domain", () => {
  const row = {
    id: "camp-1",
    name: "Win back",
    status: "active",
    message_template: "Hi {{firstName}}",
    audience: { minOrderCount: 2 },
    schedule_kind: "weekly",
    schedule_time: "10:00",
    schedule_date: null,
    schedule_interval_days: null,
    schedule_weekdays: [1, 4],
    quiet_hours_start: "21:00",
    quiet_hours_end: "08:00",
    max_per_run: 25,
    created_at: "2026-08-01T02:00:00.000Z",
  };

  it("maps the schedule into the shape due-runs expects", () => {
    const campaign = toScheduledCampaign(row, null);

    expect(campaign.schedule.scheduleKind).toBe("weekly");
    expect(campaign.schedule.scheduleWeekdays).toEqual([1, 4]);
    expect(campaign.createdAt).toEqual(new Date("2026-08-01T02:00:00.000Z"));
  });

  it("carries the last run through, so due-ness is anchored correctly", () => {
    const campaign = toScheduledCampaign(row, "2026-08-18T02:00:00.000Z");

    expect(campaign.lastRunAt).toEqual(new Date("2026-08-18T02:00:00.000Z"));
  });

  it("treats a campaign that never ran as having no last run", () => {
    expect(toScheduledCampaign(row, null).lastRunAt).toBeNull();
  });

  it("defaults a missing weekday array rather than passing undefined on", () => {
    const campaign = toScheduledCampaign({ ...row, schedule_weekdays: null }, null);

    expect(campaign.schedule.scheduleWeekdays).toEqual([]);
  });

  it("falls back to an unknown status rather than inventing 'active'", () => {
    // Defaulting to active would let a row written by a newer build start
    // texting people from an older app that does not understand its status.
    const campaign = toScheduledCampaign({ ...row, status: "something_new" }, null);

    expect(campaign.status).not.toBe("active");
  });
});

describe("listCampaignRows", () => {
  it("scopes to the tenant and returns newest first", async () => {
    queued = [{ data: [{ id: "camp-1" }], error: null }];

    await listCampaignRows("tenant-1");

    expect(argsFor("from")).toContainEqual(["sms_campaigns"]);
    expect(argsFor("eq")).toContainEqual(["tenant_id", "tenant-1"]);
    expect(argsFor("order")).toContainEqual(["created_at", { ascending: false }]);
  });

  it("throws on failure rather than showing an empty campaign list", async () => {
    queued = [{ data: null, error: { message: "denied" } }];

    await expect(listCampaignRows("tenant-1")).rejects.toThrow("denied");
  });
});

describe("createCampaign / updateCampaign", () => {
  const draft = {
    ...EMPTY_CAMPAIGN_DRAFT,
    name: "  Win back  ",
    messageTemplate: "Hi {{firstName}}",
    scheduleDate: "2026-09-01",
  };

  it("stamps the tenant onto a new campaign", async () => {
    queued = [{ data: { id: "c-1" }, error: null }];

    await createCampaign("tenant-1", draft);

    const [[row]] = argsFor("insert") as [[Record<string, unknown>]];
    expect(row.tenant_id).toBe("tenant-1");
    expect(row.message_template).toBe("Hi {{firstName}}");
  });

  it("trims the name so a stray space cannot create a near-duplicate", async () => {
    queued = [{ data: { id: "c-1" }, error: null }];

    await createCampaign("tenant-1", draft);

    const [[row]] = argsFor("insert") as [[Record<string, unknown>]];
    expect(row.name).toBe("Win back");
  });

  it("does not let an edit rewrite which tenant a campaign belongs to", async () => {
    queued = [{ data: null, error: null }];

    await updateCampaign("camp-1", draft);

    const [[patch]] = argsFor("update") as [[Record<string, unknown>]];
    expect(patch).not.toHaveProperty("tenant_id");
    expect(argsFor("eq")).toContainEqual(["id", "camp-1"]);
  });

  it("throws when the write fails", async () => {
    queued = [{ data: null, error: { message: "denied" } }];

    await expect(createCampaign("tenant-1", draft)).rejects.toThrow("denied");
  });
});

describe("ensureRun", () => {
  const dueAt = new Date("2026-08-20T02:00:00.000Z");

  it("converges on one run row per due moment", async () => {
    queued = [
      { data: null, error: null },
      { data: [{ id: "run-1" }], error: null },
    ];

    await expect(ensureRun("tenant-1", "camp-1", dueAt)).resolves.toBe("run-1");

    // ignoreDuplicates on the (campaign_id, due_at) unique index is what stops
    // two devices creating two runs of the same campaign occurrence.
    const [[, options]] = argsFor("upsert") as [[unknown, Record<string, unknown>]];
    expect(options.onConflict).toBe("campaign_id,due_at");
    expect(options.ignoreDuplicates).toBe(true);
  });

  it("returns null when the run cannot be found after upserting", async () => {
    queued = [
      { data: null, error: null },
      { data: [], error: null },
    ];

    await expect(ensureRun("tenant-1", "camp-1", dueAt)).resolves.toBeNull();
  });
});

describe("lastRunAtByCampaign", () => {
  it("keeps the most recent completed run per campaign", async () => {
    queued = [
      {
        data: [
          { campaign_id: "a", completed_at: "2026-08-20T02:00:00.000Z" },
          { campaign_id: "a", completed_at: "2026-08-01T02:00:00.000Z" },
          { campaign_id: "b", completed_at: "2026-08-10T02:00:00.000Z" },
        ],
        error: null,
      },
    ];

    await expect(lastRunAtByCampaign("tenant-1")).resolves.toEqual({
      a: "2026-08-20T02:00:00.000Z",
      b: "2026-08-10T02:00:00.000Z",
    });
  });

  it("only counts completed runs, so a halted run does not suppress the next one", async () => {
    queued = [{ data: [], error: null }];

    await lastRunAtByCampaign("tenant-1");

    expect(argsFor("eq")).toContainEqual(["status", "completed"]);
  });

  it("ignores rows with no completion timestamp", async () => {
    queued = [{ data: [{ campaign_id: "a", completed_at: null }], error: null }];

    await expect(lastRunAtByCampaign("tenant-1")).resolves.toEqual({});
  });
});
