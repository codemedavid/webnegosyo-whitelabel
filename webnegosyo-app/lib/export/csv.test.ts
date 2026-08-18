import { CSV_BOM, csvCell, toCsv } from "./csv";

describe("csvCell", () => {
  it("passes plain text through unquoted", () => {
    expect(csvCell("Burger")).toBe("Burger");
  });

  it("serializes numbers without formatting", () => {
    expect(csvCell(1234.5)).toBe("1234.5");
    expect(csvCell(0)).toBe("0");
  });

  it("serializes null and undefined as empty cells", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("renders booleans as Yes/No for the merchant, not true/false", () => {
    expect(csvCell(true)).toBe("Yes");
    expect(csvCell(false)).toBe("No");
  });

  it("quotes cells containing commas", () => {
    expect(csvCell("Cruz, Juan")).toBe('"Cruz, Juan"');
  });

  it("doubles embedded quotes and wraps the cell", () => {
    expect(csvCell('The "Best" Burger')).toBe('"The ""Best"" Burger"');
  });

  it("quotes cells containing newlines", () => {
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("neutralizes spreadsheet formula injection on leading = + - @", () => {
    // A customer named "=HYPERLINK(...)" must not execute when the merchant
    // opens the export in Excel; the apostrophe prefix is the standard guard.
    expect(csvCell("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
    expect(csvCell("+639171234567")).toBe("'+639171234567");
    expect(csvCell("-discount")).toBe("'-discount");
    expect(csvCell("@handle")).toBe("'@handle");
  });

  it("does not formula-guard numbers, only strings", () => {
    expect(csvCell(-50)).toBe("-50");
  });
});

describe("toCsv", () => {
  it("starts with a UTF-8 BOM so Excel opens ₱ and Filipino names correctly", () => {
    const csv = toCsv(["A"], [["₱100"]]);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
  });

  it("joins the header row and data rows with CRLF", () => {
    const csv = toCsv(["Name", "Total"], [["Juan", 100], ["Maria", 250.5]]);
    expect(csv).toBe(`${CSV_BOM}Name,Total\r\nJuan,100\r\nMaria,250.5`);
  });

  it("produces just the header row for an empty export", () => {
    expect(toCsv(["Name", "Total"], [])).toBe(`${CSV_BOM}Name,Total`);
  });

  it("escapes header cells too", () => {
    expect(toCsv(['Amount ("net")'], [])).toBe(`${CSV_BOM}"Amount (""net"")"`);
  });
});
