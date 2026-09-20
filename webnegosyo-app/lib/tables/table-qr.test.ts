import { buildQrModules, buildTableMenuUrl } from "./table-qr";

describe("buildTableMenuUrl", () => {
  it("points at the store's menu with the table in the query", () => {
    expect(
      buildTableMenuUrl({ webAppUrl: "https://www.webnegosyo.com", tenantSlug: "cafe", label: "12" }),
    ).toBe("https://www.webnegosyo.com/cafe/menu?table=12");
  });

  it("normalizes the label and escapes what needs escaping", () => {
    expect(
      buildTableMenuUrl({ webAppUrl: "https://www.webnegosyo.com/", tenantSlug: "cafe", label: "table patio 2" }),
    ).toBe("https://www.webnegosyo.com/cafe/menu?table=PATIO%202");
  });

  it("names the branch for a multi-branch store", () => {
    expect(
      buildTableMenuUrl({
        webAppUrl: "https://www.webnegosyo.com",
        tenantSlug: "cafe",
        label: "3",
        outletSlug: "north",
      }),
    ).toBe("https://www.webnegosyo.com/cafe/menu?table=3&outlet=north");
  });
});

describe("buildQrModules", () => {
  it("returns a square module grid with the quiet zone included", () => {
    const modules = buildQrModules("https://www.webnegosyo.com/cafe/menu?table=12");
    expect(modules).not.toBeNull();
    const { size, dark } = modules!;
    expect(dark).toHaveLength(size);
    expect(dark.every((row) => row.length === size)).toBe(true);
    // The quiet zone is blank on every side.
    expect(dark[0].every((cell) => cell === false)).toBe(true);
    expect(dark.every((row) => row[0] === false && row[size - 1] === false)).toBe(true);
    // A finder pattern's top-left corner sits just inside the quiet zone.
    expect(dark[4][4]).toBe(true);
  });

  it("gives up on text no QR version can hold rather than throwing", () => {
    expect(buildQrModules("x".repeat(5000))).toBeNull();
  });
});
