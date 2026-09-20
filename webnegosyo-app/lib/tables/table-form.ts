/**
 * What the add/edit table sheet accepts. Mirrors the database's own CHECKs
 * (label 1..24, seats 1..99, zone up to 40) so a refusal is worded for the
 * merchant here rather than surfacing as a constraint name.
 */

import { normalizeTableNumber } from "../order-table-number";
import type { TableShape, TableSize } from "./table-floor";

export interface TableDraft {
  label: string;
  /** Text, as typed into the stepper's field. */
  seats: string;
  shape: TableShape;
  size: TableSize;
  zone: string;
}

export interface TableDraftValue {
  label: string;
  seats: number;
  shape: TableShape;
  size: TableSize;
  zone: string | null;
}

export type TableDraftVerdict =
  | { ok: true; value: TableDraftValue }
  | { ok: false; field: keyof TableDraft; error: string };

export interface LabelledTable {
  id: string;
  label: string;
}

export const LABEL_MAX_LENGTH = 24;
export const ZONE_MAX_LENGTH = 40;
export const SEATS_MIN = 1;
export const SEATS_MAX = 99;
const DEFAULT_SEATS = 4;

export function validateTableDraft(
  draft: TableDraft,
  existing: readonly LabelledTable[],
  editingId?: string,
): TableDraftVerdict {
  const label = draft.label.trim().replace(/\s+/g, " ");
  if (label === "") return { ok: false, field: "label", error: "Give the table a name or number." };
  if (label.length > LABEL_MAX_LENGTH) {
    return { ok: false, field: "label", error: `Keep the name to ${LABEL_MAX_LENGTH} characters.` };
  }

  const wanted = normalizeTableNumber(label);
  const clash = existing.find(
    (table) => table.id !== editingId && normalizeTableNumber(table.label) === wanted,
  );
  if (clash) {
    return { ok: false, field: "label", error: `There is already a table "${clash.label}" on this floor.` };
  }

  const seats = Number(draft.seats.trim());
  if (!Number.isInteger(seats) || seats < SEATS_MIN || seats > SEATS_MAX) {
    return { ok: false, field: "seats", error: `Seats must be a whole number from ${SEATS_MIN} to ${SEATS_MAX}.` };
  }

  const zone = draft.zone.trim();
  if (zone.length > ZONE_MAX_LENGTH) {
    return { ok: false, field: "zone", error: `Keep the zone to ${ZONE_MAX_LENGTH} characters.` };
  }

  return {
    ok: true,
    value: { label, seats, shape: draft.shape, size: draft.size, zone: zone === "" ? null : zone },
  };
}

/** One past the highest numbered table, so "Add" needs no typing on a numbered floor. */
export function nextTableLabel(existingLabels: readonly string[]): string {
  const highest = existingLabels.reduce((max, label) => {
    const normalized = normalizeTableNumber(label);
    return /^\d+$/.test(normalized) ? Math.max(max, Number(normalized)) : max;
  }, 0);
  return String(highest + 1);
}

export function emptyTableDraft(existingLabels: readonly string[]): TableDraft {
  return {
    label: nextTableLabel(existingLabels),
    seats: String(DEFAULT_SEATS),
    shape: "square",
    size: "md",
    zone: "",
  };
}
