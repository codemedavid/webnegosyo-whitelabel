/**
 * Deliver a built CSV through the native share sheet.
 *
 * The one impure module in `lib/export/`: everything upstream builds strings,
 * this writes the file and hands it to the OS. Uses the legacy file-system API
 * deliberately — a stable function surface (`cacheDirectory` +
 * `writeAsStringAsync`) that the logic test suite can mock without
 * constructing native `File` objects.
 *
 * Availability is checked BEFORE writing: on a device that cannot share
 * (some managed iPads), failing early leaves no orphaned PII file in cache.
 */

import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

export interface ShareCsvInput {
  /** Bare file name, e.g. "orders_2026-08-12_2026-08-18.csv". */
  fileName: string;
  /** The complete CSV document, BOM included. */
  csv: string;
}

/** iOS uniform type identifier for CSV, so the share sheet offers Numbers/Excel. */
const CSV_UTI = "public.comma-separated-values-text";

/** Writes the CSV to cache and opens the share sheet. Returns the file uri. */
export async function shareCsv({ fileName, csv }: ShareCsvInput): Promise<string> {
  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    throw new Error("Sharing is not available on this device.");
  }

  const directory = FileSystem.cacheDirectory;
  if (!directory) {
    throw new Error("No cache directory is available to write the export.");
  }

  const uri = `${directory}${fileName}`;
  await FileSystem.writeAsStringAsync(uri, csv);
  await Sharing.shareAsync(uri, {
    mimeType: "text/csv",
    UTI: CSV_UTI,
    dialogTitle: fileName,
  });
  return uri;
}
