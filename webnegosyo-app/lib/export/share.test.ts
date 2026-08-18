import { shareCsv } from "./share";

// Factory mocks so the real native modules are never loaded under node.
// `__esModule: true` is load-bearing: without it the default-import fallback
// silently serves the real (unparseable) module shape.
jest.mock("expo-file-system/legacy", () => ({
  __esModule: true,
  cacheDirectory: "file:///cache/",
  writeAsStringAsync: jest.fn(async () => undefined),
}));

jest.mock("expo-sharing", () => ({
  __esModule: true,
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));

import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

const writeMock = FileSystem.writeAsStringAsync as jest.Mock;
const availableMock = Sharing.isAvailableAsync as jest.Mock;
const shareMock = Sharing.shareAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  availableMock.mockResolvedValue(true);
});

describe("shareCsv", () => {
  it("writes the CSV into the cache directory under the given name", async () => {
    await shareCsv({ fileName: "orders_2026-08-18.csv", csv: "\uFEFFA,B" });

    expect(writeMock).toHaveBeenCalledWith(
      "file:///cache/orders_2026-08-18.csv",
      "\uFEFFA,B"
    );
  });

  it("opens the share sheet on the written file with a CSV content type", async () => {
    await shareCsv({ fileName: "sales.csv", csv: "x" });

    expect(shareMock).toHaveBeenCalledWith(
      "file:///cache/sales.csv",
      expect.objectContaining({ mimeType: "text/csv" })
    );
  });

  it("returns the file uri so the caller can report where the export went", async () => {
    await expect(shareCsv({ fileName: "a.csv", csv: "x" })).resolves.toBe(
      "file:///cache/a.csv"
    );
  });

  it("throws a merchant-readable error when sharing is unavailable on the device", async () => {
    availableMock.mockResolvedValue(false);

    await expect(shareCsv({ fileName: "a.csv", csv: "x" })).rejects.toThrow(
      /sharing is not available/i
    );
    expect(writeMock).not.toHaveBeenCalled();
  });

  it("propagates write failures instead of sharing a missing file", async () => {
    writeMock.mockRejectedValue(new Error("disk full"));

    await expect(shareCsv({ fileName: "a.csv", csv: "x" })).rejects.toThrow("disk full");
    expect(shareMock).not.toHaveBeenCalled();
  });
});
