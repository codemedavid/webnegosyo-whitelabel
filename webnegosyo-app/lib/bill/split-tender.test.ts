import {
  MAX_TENDER_LINES,
  addTenderLine,
  initialTenderLines,
  removeTenderLine,
  resolveTenderCents,
  splitTenderCoverage,
  updateTenderLine,
  validateSplitTender,
  type TenderLine,
} from "./split-tender";

const METHODS = [
  { id: "cash", name: "Cash", isCash: true },
  { id: "gcash", name: "GCash" },
  { id: "maya", name: "Maya" },
];

function line(overrides: Partial<TenderLine> & Pick<TenderLine, "key">): TenderLine {
  return { methodId: null, amount: "", cash: "", reference: "", ...overrides };
}

describe("initialTenderLines", () => {
  it("opens on a non-cash method first and cash for the rest", () => {
    const lines = initialTenderLines(METHODS, "cash");

    expect(lines.map((l) => l.methodId)).toEqual(["gcash", "cash"]);
    expect(lines.every((l) => l.amount === "" && l.cash === "" && l.reference === "")).toBe(true);
  });

  it("keeps the non-cash method the cashier had already picked", () => {
    expect(initialTenderLines(METHODS, "maya").map((l) => l.methodId)).toEqual(["maya", "cash"]);
  });

  it("pairs two non-cash methods when the store takes no cash", () => {
    const methods = METHODS.filter((m) => !m.isCash);
    expect(initialTenderLines(methods, null).map((l) => l.methodId)).toEqual(["gcash", "maya"]);
  });

  it("gives every line its own key", () => {
    const keys = initialTenderLines(METHODS, null).map((l) => l.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("editing lines", () => {
  it("adds a blank line with a fresh key, up to the limit", () => {
    let lines: readonly TenderLine[] = initialTenderLines(METHODS, null);
    while (lines.length < MAX_TENDER_LINES) lines = addTenderLine(lines);
    expect(new Set(lines.map((l) => l.key)).size).toBe(MAX_TENDER_LINES);
    expect(addTenderLine(lines)).toBe(lines);
  });

  it("removes a line but never below two", () => {
    const lines = addTenderLine(initialTenderLines(METHODS, null));
    const fewer = removeTenderLine(lines, lines[2].key);
    expect(fewer).toHaveLength(2);
    expect(removeTenderLine(fewer, fewer[0].key)).toBe(fewer);
  });

  it("changes one line without touching the others", () => {
    const lines = initialTenderLines(METHODS, null);
    const next = updateTenderLine(lines, lines[0].key, { amount: "120" });
    expect(next[0].amount).toBe("120");
    expect(next[1]).toBe(lines[1]);
    expect(lines[0].amount).toBe("");
  });
});

describe("resolveTenderCents", () => {
  it("lets a blank last line take whatever the others leave", () => {
    const lines = [line({ key: "a", amount: "120" }), line({ key: "b" })];
    expect(resolveTenderCents(lines, 30000)).toEqual([12000, 18000]);
  });

  it("does not stretch a blank line that is not last", () => {
    const lines = [line({ key: "a" }), line({ key: "b", amount: "100" })];
    expect(resolveTenderCents(lines, 30000)).toEqual([null, 10000]);
  });

  it("reads an amount that is not a number as missing", () => {
    const lines = [line({ key: "a", amount: "12o" }), line({ key: "b", amount: "50" })];
    expect(resolveTenderCents(lines, 30000)).toEqual([null, 5000]);
  });
});

describe("splitTenderCoverage", () => {
  it("says how much the lines cover and what stays owed", () => {
    const lines = [line({ key: "a", amount: "120" }), line({ key: "b", amount: "100" })];
    expect(splitTenderCoverage(lines, 300)).toEqual({ coveredCents: 22000, leftCents: 8000, overCents: 0 });
  });

  it("covers the whole bill when the last line takes the rest", () => {
    const lines = [line({ key: "a", amount: "120" }), line({ key: "b" })];
    expect(splitTenderCoverage(lines, 300)).toEqual({ coveredCents: 30000, leftCents: 0, overCents: 0 });
  });

  it("says by how much the lines go over", () => {
    const lines = [line({ key: "a", amount: "200" }), line({ key: "b", amount: "150" })];
    expect(splitTenderCoverage(lines, 300)).toEqual({ coveredCents: 35000, leftCents: 0, overCents: 5000 });
  });
});

describe("validateSplitTender", () => {
  it("turns ₱120 GCash and the rest in cash into two payments", () => {
    const lines = [
      line({ key: "a", methodId: "gcash", amount: "120", reference: " GC-1 " }),
      line({ key: "b", methodId: "cash", cash: "200" }),
    ];

    expect(validateSplitTender(lines, METHODS, 300)).toEqual({
      ok: true,
      payments: [
        { amount: 120, methodId: "gcash", methodName: "GCash", reference: "GC-1" },
        { amount: 180, methodId: "cash", methodName: "Cash", cashTendered: 200, changeDue: 20 },
      ],
    });
  });

  it("takes a blank cash received as the exact amount", () => {
    const lines = [
      line({ key: "a", methodId: "gcash", amount: "120" }),
      line({ key: "b", methodId: "cash" }),
    ];

    const verdict = validateSplitTender(lines, METHODS, 300);
    expect(verdict.ok && verdict.payments[1]).toEqual({
      amount: 180,
      methodId: "cash",
      methodName: "Cash",
      cashTendered: 180,
      changeDue: 0,
    });
  });

  it("leaves no blank reference on a non-cash payment", () => {
    const lines = [line({ key: "a", methodId: "gcash", amount: "120", reference: "  " }), line({ key: "b", methodId: "maya" })];
    const verdict = validateSplitTender(lines, METHODS, 300);
    expect(verdict.ok && verdict.payments[0]).toEqual({ amount: 120, methodId: "gcash", methodName: "GCash" });
  });

  it("allows the lines to cover only part of the bill", () => {
    const lines = [
      line({ key: "a", methodId: "gcash", amount: "120" }),
      line({ key: "b", methodId: "maya", amount: "80" }),
    ];
    const verdict = validateSplitTender(lines, METHODS, 300);
    expect(verdict.ok && verdict.payments.map((p) => p.amount)).toEqual([120, 80]);
  });

  it("refuses a line with no method", () => {
    const lines = [line({ key: "a", amount: "120" }), line({ key: "b", methodId: "cash" })];
    expect(validateSplitTender(lines, METHODS, 300)).toEqual({ ok: false, error: "Choose how payment 1 was paid." });
  });

  it("refuses a missing amount on a line that is not last", () => {
    const lines = [line({ key: "a", methodId: "gcash" }), line({ key: "b", methodId: "cash", amount: "100" })];
    expect(validateSplitTender(lines, METHODS, 300)).toEqual({ ok: false, error: "Enter how much was paid by GCash." });
  });

  it("refuses an amount that is not a number, or not above zero", () => {
    const bad = [line({ key: "a", methodId: "gcash", amount: "abc" }), line({ key: "b", methodId: "cash" })];
    expect(validateSplitTender(bad, METHODS, 300)).toEqual({
      ok: false,
      error: "Enter the GCash amount as a number, like 120.",
    });
    const zero = [line({ key: "a", methodId: "gcash", amount: "0" }), line({ key: "b", methodId: "cash" })];
    expect(validateSplitTender(zero, METHODS, 300)).toEqual({ ok: false, error: "Enter more than zero for GCash." });
  });

  it("refuses a blank last line when the others already cover the bill", () => {
    const lines = [line({ key: "a", methodId: "gcash", amount: "300" }), line({ key: "b", methodId: "cash" })];
    expect(validateSplitTender(lines, METHODS, 300)).toEqual({
      ok: false,
      error: "GCash already covers the bill. Remove the Cash line, or lower the other amounts.",
    });
  });

  it("refuses lines that add up to more than is owed", () => {
    const lines = [
      line({ key: "a", methodId: "gcash", amount: "200" }),
      line({ key: "b", methodId: "cash", amount: "150" }),
    ];
    expect(validateSplitTender(lines, METHODS, 300)).toEqual({
      ok: false,
      error: "These add up to ₱350.00, but only ₱300.00 is owed.",
    });
  });

  it("refuses cash received that does not cover the cash part", () => {
    const lines = [line({ key: "a", methodId: "gcash", amount: "120" }), line({ key: "b", methodId: "cash", cash: "100" })];
    expect(validateSplitTender(lines, METHODS, 300)).toEqual({
      ok: false,
      error: "₱100.00 cash does not cover the ₱180.00 cash part.",
    });
  });

  it("refuses cash received that is not a number", () => {
    const lines = [line({ key: "a", methodId: "gcash", amount: "120" }), line({ key: "b", methodId: "cash", cash: "x" })];
    expect(validateSplitTender(lines, METHODS, 300)).toEqual({
      ok: false,
      error: "Enter the cash received as a number, like 500.",
    });
  });

  it("refuses a single line: that is not a split", () => {
    expect(validateSplitTender([line({ key: "a", methodId: "cash" })], METHODS, 300)).toEqual({
      ok: false,
      error: "Add a second payment method, or pay with one method.",
    });
  });

  it("splits a centavo balance without drift", () => {
    const lines = [line({ key: "a", methodId: "gcash", amount: "0.10" }), line({ key: "b", methodId: "maya" })];
    const verdict = validateSplitTender(lines, METHODS, 0.3);
    expect(verdict.ok && verdict.payments.map((p) => p.amount)).toEqual([0.1, 0.2]);
  });
});
