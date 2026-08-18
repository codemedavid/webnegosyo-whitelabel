import { buildCustomersCsv, type ExportCustomerInput } from "./customers-export";

function guest(overrides: Partial<ExportCustomerInput> = {}): ExportCustomerInput {
  return {
    name: "Juan Dela Cruz",
    phoneE164: "+639171234567",
    email: null,
    notes: null,
    orderCount: 5,
    totalSpent: 1250,
    averageOrderValue: 250,
    firstOrderAt: "2026-06-01T04:00:00.000Z",
    lastOrderAt: "2026-08-17T17:30:00.000Z",
    channelsUsed: ["web", "pos"],
    smsConsent: true,
    smsOptOut: false,
    ...overrides,
  };
}

describe("buildCustomersCsv", () => {
  it("emits one row per customer with the columns the screen already shows", () => {
    const csv = buildCustomersCsv([guest()]);
    const lines = csv.split("\r\n");

    expect(lines[0]).toContain(
      "Name,Phone,Email,Orders,Total Spent,Avg Order Value,First Order,Last Order,Channels,SMS Consent,Notes"
    );
    // Timestamps render as Manila days; the phone is formula-guarded.
    expect(lines[1]).toBe(
      "Juan Dela Cruz,'+639171234567,,5,1250,250,2026-06-01,2026-08-18,web; pos,Yes,"
    );
  });

  it("renders SMS consent No when the guest opted out, even with prior consent", () => {
    const csv = buildCustomersCsv([guest({ smsConsent: true, smsOptOut: true })]);
    expect(csv.split("\r\n")[1]).toContain(",No,");
  });

  it("leaves missing name, dates, and notes empty rather than printing null", () => {
    const csv = buildCustomersCsv([
      guest({ name: null, firstOrderAt: null, lastOrderAt: null, channelsUsed: [] }),
    ]);
    const row = csv.split("\r\n")[1];
    expect(row).not.toContain("null");
    expect(row.startsWith(",")).toBe(true);
  });

  it("handles an empty guest list as a header-only file", () => {
    const csv = buildCustomersCsv([]);
    expect(csv.split("\r\n")).toHaveLength(1);
  });
});
