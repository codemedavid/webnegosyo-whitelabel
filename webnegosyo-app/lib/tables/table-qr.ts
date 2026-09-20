/**
 * The code a guest scans at the table. It opens the store's menu with the
 * table in the query, which the storefront reads into the Table Number
 * checkout field — so an order from that phone names the table without the
 * guest typing anything.
 *
 * Pure JS, like lib/receipt-qr.ts: the modules come out as a grid the screen
 * draws with react-native-svg, so nothing native is needed and the whole path
 * is unit-testable.
 */

import qrcode from "qrcode-generator";

import { normalizeTableNumber } from "../order-table-number";

export const TABLE_QUERY_PARAM = "table";
export const OUTLET_QUERY_PARAM = "outlet";

/** Modules of blank border on every side. The QR spec asks for 4. */
const QUIET_ZONE = 4;
/** Error correction M: a phone screen reads it fine and the code stays small. */
const ERROR_CORRECTION = "M";

export interface TableMenuUrlInput {
  webAppUrl: string;
  tenantSlug: string;
  label: string;
  /** The branch this table stands in, for a multi-branch store. */
  outletSlug?: string | null;
}

export function buildTableMenuUrl(input: TableMenuUrlInput): string {
  const base = input.webAppUrl.replace(/\/+$/, "");
  const query = [`${TABLE_QUERY_PARAM}=${encodeURIComponent(normalizeTableNumber(input.label))}`];
  if (input.outletSlug) query.push(`${OUTLET_QUERY_PARAM}=${encodeURIComponent(input.outletSlug)}`);
  return `${base}/${encodeURIComponent(input.tenantSlug)}/menu?${query.join("&")}`;
}

export interface QrModules {
  /** Edge length in modules, quiet zone included. */
  size: number;
  /** dark[row][col] */
  dark: boolean[][];
}

/** Null when the text cannot fit any QR version — the caller shows the link instead. */
export function buildQrModules(text: string, quietZone: number = QUIET_ZONE): QrModules | null {
  let moduleCount: number;
  let isDark: (row: number, col: number) => boolean;
  try {
    const qr = qrcode(0, ERROR_CORRECTION); // type 0 = smallest fitting version
    qr.addData(text);
    qr.make();
    moduleCount = qr.getModuleCount();
    isDark = (row, col) => qr.isDark(row, col);
  } catch {
    return null;
  }

  const size = moduleCount + quietZone * 2;
  const dark = Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => {
      const r = row - quietZone;
      const c = col - quietZone;
      return r >= 0 && c >= 0 && r < moduleCount && c < moduleCount && isDark(r, c);
    }),
  );
  return { size, dark };
}
