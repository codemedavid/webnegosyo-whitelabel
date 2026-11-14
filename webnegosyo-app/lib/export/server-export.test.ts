import { downloadServerExport, exportFileName, isServerExportPath } from "./server-export";

jest.mock("../web-app-url", () => ({ getWebAppUrl: () => "https://web.example" }));

jest.mock("expo-file-system/legacy", () => ({
  __esModule: true,
  cacheDirectory: "file:///cache/",
  downloadAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  deleteAsync: jest.fn(async () => undefined),
  moveAsync: jest.fn(async () => undefined),
}));

jest.mock("expo-sharing", () => ({
  __esModule: true,
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));

import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

const downloadMock = FileSystem.downloadAsync as jest.Mock;
const readMock = FileSystem.readAsStringAsync as jest.Mock;
const moveMock = FileSystem.moveAsync as jest.Mock;
const shareMock = Sharing.shareAsync as jest.Mock;
const deps = { getToken: async () => "tok" };
const PATH = "/api/exports?tenantId=t&sheets=orders&period=today&format=xlsx&source=owl";

beforeEach(() => jest.clearAllMocks());

describe("isServerExportPath", () => {
  it("accepts only the export route on our own web app", () => {
    expect(isServerExportPath(PATH)).toBe(true);
    for (const bad of ["https://evil.example/api/exports?x=1", "//evil.example/api/exports?x", "/api/exports", "/api/other?x=1", "/api/exports?next=//evil", null, 5]) {
      expect(isServerExportPath(bad)).toBe(false);
    }
  });
});

describe("exportFileName", () => {
  it("takes the server's name and refuses anything that is not a plain export file", () => {
    expect(exportFileName('attachment; filename="shop-export-2026-11-14.xlsx"', "export.xlsx")).toBe("shop-export-2026-11-14.xlsx");
    expect(exportFileName('attachment; filename="../../etc/passwd"', "export.xlsx")).toBe("export.xlsx");
    expect(exportFileName(null, "export.zip")).toBe("export.zip");
  });
});

describe("downloadServerExport", () => {
  it("downloads as this account, names the file as the server did, and opens the share sheet", async () => {
    downloadMock.mockResolvedValue({ status: 200, headers: { "content-disposition": 'attachment; filename="shop-orders-2026-11-14.xlsx"' } });
    await expect(downloadServerExport(PATH, deps)).resolves.toBe("shop-orders-2026-11-14.xlsx");
    expect(downloadMock).toHaveBeenCalledWith(`https://web.example${PATH}`, expect.stringMatching(/^file:\/\/\/cache\/export-\d+\.download$/), {
      headers: { Authorization: "Bearer tok" },
    });
    expect(moveMock).toHaveBeenCalledWith({ from: expect.any(String), to: "file:///cache/shop-orders-2026-11-14.xlsx" });
    expect(shareMock).toHaveBeenCalledWith("file:///cache/shop-orders-2026-11-14.xlsx", expect.objectContaining({ UTI: "org.openxmlformats.spreadsheetml.sheet" }));
  });

  it("shows the server's own sentence on a refusal and shares nothing", async () => {
    downloadMock.mockResolvedValue({ status: 403, headers: {} });
    readMock.mockResolvedValue(JSON.stringify({ success: false, error: "You need the Reports permission to export. Ask the store owner." }));
    await expect(downloadServerExport(PATH, deps)).rejects.toThrow("You need the Reports permission to export.");
    expect(shareMock).not.toHaveBeenCalled();
  });

  it("never sends the token anywhere but the export route", async () => {
    await expect(downloadServerExport("https://evil.example/api/exports?x=1", deps)).rejects.toThrow();
    expect(downloadMock).not.toHaveBeenCalled();
  });
});
