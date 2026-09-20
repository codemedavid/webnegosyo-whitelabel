/**
 * Reads and writes for the floor plan — the only file here that touches
 * Supabase. The floor lives in the platform database for every tenant, so
 * this reads Supabase directly rather than going through the order-backend
 * dispatch in lib/hooks.ts (the same arrangement as lib/use-outlets.ts).
 *
 * Every read and write names the tenant explicitly. RLS is not the boundary:
 * a superadmin's session reaches every store, so an unscoped read inside an
 * impersonated store would show another merchant's floor.
 */

import { supabase } from "../supabase";
import type { PositionMove } from "./floor-layout";
import { normalizeRotation, type DiningTable, type TableSeating, type TableShape, type TableSize } from "./table-floor";
import type { TableDraftValue } from "./table-form";

export const DINING_TABLES_RESOURCE = "dining-tables";
export const TABLE_SEATINGS_RESOURCE = "table-seatings";

const TABLE_COLUMNS =
  "id, tenant_id, outlet_id, label, seats, shape, size, zone, pos_x, pos_y, rotation, sort_order, is_active";
const SEATING_COLUMNS = "id, table_id, party_size, seated_at, note";

export interface DiningTableRow {
  id: string;
  tenant_id: string;
  outlet_id: string | null;
  label: string;
  seats: number;
  shape: string;
  size: string;
  zone: string | null;
  pos_x: number | string;
  pos_y: number | string;
  rotation?: number | string | null;
  sort_order: number;
  is_active: boolean;
}

export interface TableSeatingRow {
  id: string;
  table_id: string;
  party_size: number;
  seated_at: string;
  note: string | null;
}

const SHAPES: readonly TableShape[] = ["round", "square", "rect"];
const SIZES: readonly TableSize[] = ["sm", "md", "lg"];

function asFraction(value: number | string): number {
  // NUMERIC comes back from PostgREST as a string.
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : 0;
}

export function mapTableRow(row: DiningTableRow): DiningTable {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    outletId: row.outlet_id,
    label: row.label,
    seats: row.seats,
    shape: SHAPES.includes(row.shape as TableShape) ? (row.shape as TableShape) : "square",
    size: SIZES.includes(row.size as TableSize) ? (row.size as TableSize) : "md",
    zone: row.zone,
    posX: asFraction(row.pos_x),
    posY: asFraction(row.pos_y),
    rotation: normalizeRotation(row.rotation),
    sortOrder: row.sort_order,
    isActive: row.is_active,
  };
}

export function mapSeatingRow(row: TableSeatingRow): TableSeating {
  const seatedAt = Date.parse(row.seated_at);
  return {
    id: row.id,
    tableId: row.table_id,
    partySize: row.party_size,
    seatedAt: Number.isFinite(seatedAt) ? seatedAt : 0,
    note: row.note,
  };
}

function fail(message: string, error: { message?: string } | null): never {
  throw new Error(error?.message ? `${message}: ${error.message}` : message);
}

export async function fetchDiningTables(tenantId: string): Promise<DiningTable[]> {
  const { data, error } = await supabase
    .from("dining_tables")
    .select(TABLE_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("sort_order")
    .order("label");
  if (error) fail("Could not load your tables", error);
  return ((data ?? []) as DiningTableRow[]).map(mapTableRow);
}

export async function fetchOpenSeatings(tenantId: string): Promise<TableSeating[]> {
  const { data, error } = await supabase
    .from("table_seatings")
    .select(SEATING_COLUMNS)
    .eq("tenant_id", tenantId)
    .is("cleared_at", null);
  if (error) fail("Could not load who is seated", error);
  return ((data ?? []) as TableSeatingRow[]).map(mapSeatingRow);
}

export interface CreateTableInput {
  tenantId: string;
  outletId: string | null;
  value: TableDraftValue;
  posX: number;
  posY: number;
  sortOrder: number;
}

export async function createDiningTable(input: CreateTableInput): Promise<DiningTable> {
  const { data, error } = await supabase
    .from("dining_tables")
    .insert({
      tenant_id: input.tenantId,
      outlet_id: input.outletId,
      label: input.value.label,
      seats: input.value.seats,
      shape: input.value.shape,
      size: input.value.size,
      zone: input.value.zone,
      pos_x: input.posX,
      pos_y: input.posY,
      sort_order: input.sortOrder,
    })
    .select(TABLE_COLUMNS)
    .single();
  if (error || !data) fail("Could not add the table", error);
  return mapTableRow(data as DiningTableRow);
}

export async function updateDiningTable(
  tenantId: string,
  id: string,
  value: TableDraftValue,
): Promise<void> {
  const { error } = await supabase
    .from("dining_tables")
    .update({
      label: value.label,
      seats: value.seats,
      shape: value.shape,
      size: value.size,
      zone: value.zone,
    })
    .eq("tenant_id", tenantId)
    .eq("id", id);
  if (error) fail("Could not save the table", error);
}

export async function archiveDiningTable(tenantId: string, id: string): Promise<void> {
  const { error } = await supabase
    .from("dining_tables")
    .update({ is_active: false })
    .eq("tenant_id", tenantId)
    .eq("id", id);
  if (error) fail("Could not remove the table", error);
}

/** One UPDATE per moved table; a layout edit rarely moves more than a few. */
export async function saveTablePositions(
  tenantId: string,
  moves: readonly PositionMove[],
): Promise<void> {
  const results = await Promise.all(
    moves.map((move) =>
      supabase
        .from("dining_tables")
        .update(
          // A move that did not turn the table must not write a rotation:
          // the column would otherwise be reset by every drag.
          move.rotation === undefined
            ? { pos_x: move.posX, pos_y: move.posY }
            : { pos_x: move.posX, pos_y: move.posY, rotation: move.rotation },
        )
        .eq("tenant_id", tenantId)
        .eq("id", move.id),
    ),
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) fail("Could not save the floor layout", failed.error);
}

export interface SeatPartyInput {
  tenantId: string;
  tableId: string;
  partySize: number;
  note?: string | null;
  userId: string | null;
}

export async function seatParty(input: SeatPartyInput): Promise<TableSeating> {
  const { data, error } = await supabase
    .from("table_seatings")
    .insert({
      tenant_id: input.tenantId,
      table_id: input.tableId,
      party_size: input.partySize,
      note: input.note ?? null,
      seated_by: input.userId,
    })
    .select(SEATING_COLUMNS)
    .single();
  if (error || !data) fail("Could not seat the party", error);
  return mapSeatingRow(data as TableSeatingRow);
}

export async function updatePartySize(
  tenantId: string,
  seatingId: string,
  partySize: number,
): Promise<void> {
  const { error } = await supabase
    .from("table_seatings")
    .update({ party_size: partySize })
    .eq("tenant_id", tenantId)
    .eq("id", seatingId)
    .is("cleared_at", null);
  if (error) fail("Could not change the party size", error);
}

export async function clearSeating(
  tenantId: string,
  seatingId: string,
  userId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("table_seatings")
    .update({ cleared_at: new Date().toISOString(), cleared_by: userId })
    .eq("tenant_id", tenantId)
    .eq("id", seatingId)
    .is("cleared_at", null);
  if (error) fail("Could not clear the table", error);
}

/** The branch's URL slug, for the table QR of a multi-branch store. Null when unbranched or unknown. */
export async function fetchOutletSlug(tenantId: string, outletId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("outlets")
    .select("slug")
    .eq("tenant_id", tenantId)
    .eq("id", outletId)
    .maybeSingle();
  if (error) fail("Could not load the branch", error);
  const slug = (data as { slug?: string | null } | null)?.slug;
  return typeof slug === "string" && slug.trim() !== "" ? slug : null;
}
