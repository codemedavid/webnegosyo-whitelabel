/**
 * Download a file the server builds (`GET /api/exports?…`) and hand it to the
 * share sheet. The server reads as THIS account (Bearer token), so the file
 * holds exactly what the web Export page would give the same person.
 *
 * Like `share.ts`, the native modules load lazily: an older binary without
 * them must not crash every screen that imports this.
 */

import { getWebAppUrl } from "../web-app-url";

type FileSystemModule = typeof import("expo-file-system/legacy");
type SharingModule = typeof import("expo-sharing");

const NATIVE_MODULE_MISSING_MESSAGE = "Exporting is not supported by this app version. Please update the app and try again.";
const GENERIC_FAILURE = "The file could not be prepared. Try again in a moment.";

const MIME_BY_EXTENSION: Readonly<Record<string, { mimeType: string; UTI: string }>> = {
  xlsx: { mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", UTI: "org.openxmlformats.spreadsheetml.sheet" },
  csv: { mimeType: "text/csv", UTI: "public.comma-separated-values-text" },
  zip: { mimeType: "application/zip", UTI: "public.zip-archive" },
};

/** Only the export route, on our own web app: a card can never make the app fetch another address with the token. */
export function isServerExportPath(path: unknown): path is string {
  return typeof path === "string" && path.startsWith("/api/exports?") && !path.includes("//") && !path.includes("\\");
}

/** `attachment; filename="shop-export-2026-11-14.xlsx"` → a safe bare file name. */
export function exportFileName(disposition: string | null | undefined, fallback: string): string {
  const match = /filename="?([^";]+)"?/i.exec(disposition ?? "");
  const name = (match?.[1] ?? "").replace(/[^A-Za-z0-9._-]/g, "");
  return /\.(xlsx|csv|zip)$/.test(name) ? name : fallback;
}

function fallbackName(path: string): string {
  return /[?&]format=csv(&|$)/.test(path) ? "export.zip" : "export.xlsx";
}

export interface ServerExportDeps {
  getToken: () => Promise<string>;
}

/** Downloads the file and opens the share sheet. Returns the file name. Throws a sentence the owner can read. */
export async function downloadServerExport(path: string, { getToken }: ServerExportDeps): Promise<string> {
  if (!isServerExportPath(path)) throw new Error(GENERIC_FAILURE);
  let FileSystem: FileSystemModule;
  let Sharing: SharingModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    FileSystem = require("expo-file-system/legacy") as FileSystemModule;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Sharing = require("expo-sharing") as SharingModule;
  } catch {
    throw new Error(NATIVE_MODULE_MISSING_MESSAGE);
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing is not available on this device.");
  const directory = FileSystem.cacheDirectory;
  if (!directory) throw new Error("No cache directory is available to write the export.");

  const token = await getToken();
  const temporary = `${directory}export-${Date.now()}.download`;
  const result = await FileSystem.downloadAsync(`${getWebAppUrl()}${path}`, temporary, { headers: { Authorization: `Bearer ${token}` } });
  if (result.status !== 200) {
    // A refusal is JSON with a sentence meant for the person.
    const body = await FileSystem.readAsStringAsync(temporary).catch(() => "");
    await FileSystem.deleteAsync(temporary, { idempotent: true }).catch(() => undefined);
    let message = GENERIC_FAILURE;
    try {
      const parsed = JSON.parse(body) as { error?: unknown };
      if (typeof parsed.error === "string" && parsed.error.trim()) message = parsed.error.trim().slice(0, 300);
    } catch {
      // Not JSON: keep the plain sentence.
    }
    throw new Error(message);
  }
  const headers = result.headers ?? {};
  const disposition = headers["Content-Disposition"] ?? headers["content-disposition"];
  const name = exportFileName(disposition, fallbackName(path));
  const uri = `${directory}${name}`;
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
  await FileSystem.moveAsync({ from: temporary, to: uri });
  const kind = MIME_BY_EXTENSION[name.split(".").pop() ?? ""] ?? MIME_BY_EXTENSION.xlsx;
  await Sharing.shareAsync(uri, { mimeType: kind.mimeType, UTI: kind.UTI, dialogTitle: name });
  return name;
}
