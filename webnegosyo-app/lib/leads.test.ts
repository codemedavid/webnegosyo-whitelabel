import {
  LEAD_STATUSES,
  allowedNextStatuses,
  filterLeads,
  formatBookingSlot,
  isTerminalStatus,
  summarizeLeads,
} from "./leads";

const NEW_LEAD = {
  id: "l1",
  name: "Ana Cruz",
  email: "ana@example.com",
  phone: "09171234567",
  booking_date: "2026-08-01",
  booking_time: "14:30:00",
  status: "new",
  source: "landing_page",
  converted_tenant_id: null,
  created_at: "2026-07-20T02:00:00Z",
};

const QUALIFIED_LEAD = {
  ...NEW_LEAD,
  id: "l2",
  name: "Ben Santos",
  email: "ben@grill.ph",
  phone: "09998887777",
  status: "qualified",
};

const LOST_LEAD = { ...NEW_LEAD, id: "l3", name: "Cara Lim", status: "lost" };

const ALL = [NEW_LEAD, QUALIFIED_LEAD, LOST_LEAD];

describe("LEAD_STATUSES", () => {
  it("matches the database status check constraint", () => {
    // leads.status CHECK (status IN ('new','contacted','qualified','converted','lost'))
    expect(LEAD_STATUSES.map((s) => s.key)).toEqual([
      "new",
      "contacted",
      "qualified",
      "converted",
      "lost",
    ]);
  });

  it("labels every status", () => {
    for (const status of LEAD_STATUSES) {
      expect(status.label.length).toBeGreaterThan(0);
    }
  });
});

describe("isTerminalStatus", () => {
  it("treats converted as terminal", () => {
    expect(isTerminalStatus("converted")).toBe(true);
  });

  it("treats lost as terminal", () => {
    expect(isTerminalStatus("lost")).toBe(true);
  });

  it("treats an in-flight status as open", () => {
    expect(isTerminalStatus("new")).toBe(false);
    expect(isTerminalStatus("qualified")).toBe(false);
  });
});

describe("allowedNextStatuses", () => {
  it("moves a new lead forward or marks it lost", () => {
    expect(allowedNextStatuses("new")).toEqual(["contacted", "lost"]);
  });

  it("moves a contacted lead forward or marks it lost", () => {
    expect(allowedNextStatuses("contacted")).toEqual(["qualified", "lost"]);
  });

  it("converts or loses a qualified lead", () => {
    expect(allowedNextStatuses("qualified")).toEqual(["converted", "lost"]);
  });

  it("offers nothing once a lead is converted", () => {
    expect(allowedNextStatuses("converted")).toEqual([]);
  });

  it("offers nothing once a lead is lost", () => {
    expect(allowedNextStatuses("lost")).toEqual([]);
  });

  it("never offers the status the lead already has", () => {
    for (const status of LEAD_STATUSES) {
      expect(allowedNextStatuses(status.key)).not.toContain(status.key);
    }
  });
});

describe("filterLeads", () => {
  it("returns every lead for an empty query", () => {
    expect(filterLeads(ALL, { query: "" })).toHaveLength(3);
  });

  it("matches on name", () => {
    expect(filterLeads(ALL, { query: "Ben" }).map((l) => l.id)).toEqual(["l2"]);
  });

  it("matches on email", () => {
    expect(filterLeads(ALL, { query: "grill.ph" }).map((l) => l.id)).toEqual([
      "l2",
    ]);
  });

  it("matches on phone", () => {
    expect(filterLeads(ALL, { query: "0999" }).map((l) => l.id)).toEqual(["l2"]);
  });

  it("ignores case and surrounding whitespace", () => {
    expect(filterLeads(ALL, { query: "  ANA  " }).map((l) => l.id)).toEqual([
      "l1",
    ]);
  });

  it("filters by status", () => {
    expect(filterLeads(ALL, { query: "", status: "qualified" }).map((l) => l.id)).toEqual(
      ["l2"]
    );
  });

  it("combines search and status", () => {
    expect(
      filterLeads(ALL, { query: "a", status: "lost" }).map((l) => l.id)
    ).toEqual(["l3"]);
  });

  it("does not mutate the source list", () => {
    const source = [...ALL];

    filterLeads(source, { query: "ben" });

    expect(source).toEqual(ALL);
  });
});

describe("summarizeLeads", () => {
  it("counts each status for the pipeline header", () => {
    expect(summarizeLeads(ALL)).toEqual({
      total: 3,
      new: 1,
      contacted: 0,
      qualified: 1,
      converted: 0,
      lost: 1,
      open: 2,
    });
  });

  it("counts an empty pipeline without dividing by zero", () => {
    expect(summarizeLeads([])).toEqual({
      total: 0,
      new: 0,
      contacted: 0,
      qualified: 0,
      converted: 0,
      lost: 0,
      open: 0,
    });
  });
});

describe("formatBookingSlot", () => {
  it("renders the date and trims seconds off the time", () => {
    expect(formatBookingSlot("2026-08-01", "14:30:00")).toBe("2026-08-01 · 14:30");
  });

  it("accepts a time that already has no seconds", () => {
    expect(formatBookingSlot("2026-08-01", "09:05")).toBe("2026-08-01 · 09:05");
  });

  it("falls back to the date alone when there is no time", () => {
    expect(formatBookingSlot("2026-08-01", null)).toBe("2026-08-01");
  });

  it("returns a dash when there is no booking at all", () => {
    expect(formatBookingSlot(null, null)).toBe("—");
  });
});
