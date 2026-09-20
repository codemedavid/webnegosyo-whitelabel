import { emptyTableDraft, nextTableLabel, validateTableDraft, type TableDraft } from "./table-form";

const draft = (overrides: Partial<TableDraft> = {}): TableDraft => ({
  label: "12",
  seats: "4",
  shape: "square",
  size: "md",
  zone: "",
  ...overrides,
});

describe("validateTableDraft", () => {
  it("accepts a plain table and trims what the merchant typed", () => {
    const verdict = validateTableDraft(draft({ label: " Patio 2 ", zone: " Outside " }), []);
    expect(verdict).toEqual({
      ok: true,
      value: { label: "Patio 2", seats: 4, shape: "square", size: "md", zone: "Outside" },
    });
  });

  it("stores an empty zone as null", () => {
    const verdict = validateTableDraft(draft(), []);
    expect(verdict.ok && verdict.value.zone).toBeNull();
  });

  it("refuses an empty or over-long label", () => {
    expect(validateTableDraft(draft({ label: "  " }), [])).toMatchObject({ ok: false, field: "label" });
    expect(validateTableDraft(draft({ label: "x".repeat(25) }), [])).toMatchObject({ ok: false, field: "label" });
  });

  it("refuses a label another live table on the floor already uses, however it is cased", () => {
    const verdict = validateTableDraft(draft({ label: "table 12" }), [{ id: "other", label: "12" }]);
    expect(verdict).toMatchObject({ ok: false, field: "label" });
  });

  it("lets a table keep its own label when edited", () => {
    const verdict = validateTableDraft(draft({ label: "12" }), [{ id: "me", label: "12" }], "me");
    expect(verdict.ok).toBe(true);
  });

  it("needs a seat count between 1 and 99", () => {
    expect(validateTableDraft(draft({ seats: "" }), [])).toMatchObject({ ok: false, field: "seats" });
    expect(validateTableDraft(draft({ seats: "0" }), [])).toMatchObject({ ok: false, field: "seats" });
    expect(validateTableDraft(draft({ seats: "100" }), [])).toMatchObject({ ok: false, field: "seats" });
    expect(validateTableDraft(draft({ seats: "2.5" }), [])).toMatchObject({ ok: false, field: "seats" });
    expect(validateTableDraft(draft({ seats: "99" }), []).ok).toBe(true);
  });

  it("caps the zone name", () => {
    expect(validateTableDraft(draft({ zone: "z".repeat(41) }), [])).toMatchObject({ ok: false, field: "zone" });
  });
});

describe("nextTableLabel", () => {
  it("starts at 1 on an empty floor", () => {
    expect(nextTableLabel([])).toBe("1");
  });

  it("continues past the highest numbered table", () => {
    expect(nextTableLabel(["1", "2", "7"])).toBe("8");
  });

  it("ignores lettered labels and reads a spoken prefix", () => {
    expect(nextTableLabel(["A", "Table 3", "Patio"])).toBe("4");
  });
});

describe("emptyTableDraft", () => {
  it("prefills the next label and a four-top", () => {
    expect(emptyTableDraft(["1", "2"])).toEqual({
      label: "3",
      seats: "4",
      shape: "square",
      size: "md",
      zone: "",
    });
  });
});
