import { amountLabel, pesoTextToCents, resultPill, statusLine, whoLine } from "./remittance-view";
import { parseRemittance, type Remittance } from "./remittances";

const base = parseRemittance({
  id: "r1",
  kind: "shift",
  status: "pending",
  cashier_name: "Ana Reyes",
  handed_over_cents: 634500,
  remitted_to_name: "Maria Santos",
  created_at: "2026-10-24T18:51:00.000Z",
  shift: { drawer_name: "Cashier 1", closing_count: 8345, expected_cash: 8465 },
});
const make = (patch: Partial<Remittance>): Remittance => ({ ...base, ...patch });

describe("remittance words", () => {
  it("pills say the result in words with a tone", () => {
    expect(resultPill(base)).toEqual({ label: "Short ₱120", tone: "bad" });
    expect(resultPill(make({ shift: { ...base.shift!, countedCents: 848500 } }))).toEqual({ label: "Over ₱20", tone: "warn" });
    expect(resultPill(make({ shift: { ...base.shift!, countedCents: 846500 } }))).toEqual({ label: "Exact", tone: "good" });
    expect(resultPill(make({ handedOverCents: null, shift: null }))).toEqual({ label: "Not counted", tone: "neutral" });
    expect(resultPill(make({ kind: "pickup" }))).toEqual({ label: "Pickup", tone: "neutral" });
  });

  it("status lines say who has it", () => {
    expect(statusLine(base)).toBe("Waiting for Maria Santos");
    expect(statusLine(make({ remittedToName: null, toSafe: true }))).toBe("In the safe, waiting to be counted");
    expect(
      statusLine(make({ status: "accepted", receivedByName: "Maria", receivedCents: 630000, acceptMethod: "pin" })),
    ).toBe("Accepted by Maria with PIN · ₱45 less than the slip");
    expect(statusLine(make({ status: "disputed", receivedByName: "Maria", disputeReason: "Envelope short" }))).toBe(
      "Problem reported by Maria: Envelope short",
    );
    expect(statusLine(make({ status: "resolved", resolvedByName: "Lorna", resolutionNote: "Found in safe" }))).toBe(
      "Settled by Lorna: Found in safe",
    );
  });

  it("never shows ₱0 for an amount nobody counted", () => {
    expect(amountLabel(base)).toBe("₱6,345");
    expect(amountLabel(make({ handedOverCents: null }))).toBe("Not counted yet");
    expect(whoLine(base)).toBe("Ana Reyes · Cashier 1");
  });
});

describe("pesoTextToCents", () => {
  it("reads what a person types, in whole centavos", () => {
    expect(pesoTextToCents("6,300.50")).toBe(630050);
    expect(pesoTextToCents("₱ 6300")).toBe(630000);
    expect(pesoTextToCents("0.05")).toBe(5);
    expect(pesoTextToCents("")).toBeNull();
    expect(pesoTextToCents("12.345")).toBeNull();
    expect(pesoTextToCents("-5")).toBeNull();
  });
});
