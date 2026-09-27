/**
 * The tenant's vouchers, read and written from the merchant app.
 *
 * Writes go straight to the platform `vouchers` / `voucher_targets` tables
 * under their tenant-scoped RLS policy — the same posture as payment methods
 * and products in this app. The row written here is deliberately the web
 * admin's row (`src/app/actions/voucher-admin.ts`): same code normalisation,
 * same defaults, same validator run again before any write, because a voucher
 * saved on the phone must be one the web admin opens without surprise.
 *
 * As on the web, a voucher is never deleted: `voucher_redemptions` references
 * it, and a past discounted order needs its code to still resolve. Switching
 * it off is how a merchant retires one.
 *
 * The `vouchers` staff permission gates the screen; RLS lets any tenant admin
 * write, so like the payments tab the gate is a UI one (see
 * `lib/staff-permissions.ts`).
 */

import { supabase } from "../supabase";
import {
  normalizeVoucherCode,
  validateVoucherDraft,
  type VoucherDraft,
  type VoucherIssue,
} from "../vouchers/admin-validation";
import { mapVoucherRow, type VoucherRow, type VoucherTargetRow } from "../vouchers/mapper";
import type { Voucher, VoucherChannel } from "../vouchers/types";

const VOUCHER_SELECT = "*, voucher_targets(voucher_id, target_type, target_id)";
const DEFAULT_CHANNELS: readonly VoucherChannel[] = ["checkout", "pos", "admin"];

/** Enough history for a performance card; a code used more often says so. */
export const REDEMPTION_READ_LIMIT = 500;

const UNIQUE_VIOLATION = "23505";
const INSUFFICIENT_PRIVILEGE = "42501";

export type SaveVoucherResult =
  | { ok: true; voucherId: string }
  | { ok: false; error: string; issues?: VoucherIssue[]; voucherId?: string };

interface VoucherRowWithTargets extends VoucherRow {
  voucher_targets: VoucherTargetRow[] | null;
}

interface PostgrestLikeError {
  code?: string;
  message?: string;
}

function toVoucher(row: VoucherRowWithTargets): Voucher {
  return mapVoucherRow(row, row.voucher_targets ?? []);
}

/** Every voucher the tenant has, switched off or not, newest first. */
export async function listManagedVouchers(tenantId: string): Promise<Voucher[]> {
  const { data, error } = await supabase
    .from("vouchers")
    .select(VOUCHER_SELECT)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as unknown as VoucherRowWithTargets[]).map(toVoucher);
}

/** One voucher of this tenant, or null when it is not theirs or is gone. */
export async function getManagedVoucher(voucherId: string, tenantId: string): Promise<Voucher | null> {
  const { data, error } = await supabase
    .from("vouchers")
    .select(VOUCHER_SELECT)
    .eq("id", voucherId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw error;
  return data ? toVoucher(data as unknown as VoucherRowWithTargets) : null;
}

/** The web admin's row, field for field. */
function toRow(tenantId: string, draft: VoucherDraft): Record<string, unknown> {
  return {
    tenant_id: tenantId,
    code: normalizeVoucherCode(draft.code),
    name: draft.name.trim(),
    discount_type: draft.discountType,
    discount_value: draft.discountType === "free_delivery" ? 0 : draft.discountValue,
    max_discount_amount: draft.maxDiscountAmount ?? null,
    min_order_amount: draft.minOrderAmount ?? 0,
    scope: draft.scope,
    is_stackable: draft.isStackable,
    usage_limit_total: draft.usageLimitTotal ?? null,
    usage_limit_per_customer: draft.usageLimitPerCustomer ?? null,
    starts_at: draft.startsAt ?? null,
    ends_at: draft.endsAt ?? null,
    channels: draft.channels ? [...draft.channels] : [...DEFAULT_CHANNELS],
  };
}

/**
 * Create (no id) or update a voucher, then replace its targets.
 *
 * Returns rather than throws, because every failure here is one the merchant
 * can act on and the editor shows it in place.
 */
export async function saveVoucher(
  tenantId: string,
  draft: VoucherDraft,
  voucherId?: string,
): Promise<SaveVoucherResult> {
  // The form validates too; this is the rule, the form's copy is the courtesy.
  const { errors } = validateVoucherDraft(draft);
  if (errors.length > 0) {
    return { ok: false, error: "Please fix the highlighted fields.", issues: [...errors] };
  }

  const row = toRow(tenantId, draft);
  const saved = voucherId
    ? await supabase
        .from("vouchers")
        .update(row)
        .eq("id", voucherId)
        .eq("tenant_id", tenantId)
        .select("id")
        .single()
    : await supabase.from("vouchers").insert(row).select("id").single();

  if (saved.error) return describeWriteError(saved.error as PostgrestLikeError, String(row.code));

  const savedId = (saved.data as { id: string }).id;
  const targetError = await replaceTargets(savedId, draft);
  if (targetError) {
    console.error("[vouchers] target write failed:", targetError);
    return {
      ok: false,
      error: "The voucher was saved, but its products could not be. Open it and save again.",
      voucherId: savedId,
    };
  }
  return { ok: true, voucherId: savedId };
}

function describeWriteError(error: PostgrestLikeError, code: string): SaveVoucherResult {
  // The unique index on (tenant_id, lower(code)) is the authority on duplicates.
  if (error.code === UNIQUE_VIOLATION) {
    return {
      ok: false,
      error: `The code ${code} is already in use.`,
      issues: [{ field: "code", message: "This code already exists." }],
    };
  }
  if (error.code === INSUFFICIENT_PRIVILEGE) {
    return { ok: false, error: "You don't have permission to manage vouchers." };
  }
  console.error("[vouchers] save failed:", error);
  return { ok: false, error: "Could not save this voucher. Check your connection and try again." };
}

/** Replace-all rather than diff: the target set is small and order-free. */
async function replaceTargets(voucherId: string, draft: VoucherDraft): Promise<string | null> {
  const { error: clearError } = await supabase
    .from("voucher_targets")
    .delete()
    .eq("voucher_id", voucherId);
  if (clearError) return (clearError as PostgrestLikeError).message ?? "clear failed";

  const ids = draft.scope === "universal" ? [] : [...new Set(draft.targetIds ?? [])];
  if (ids.length === 0) return null;

  const targetType = draft.scope === "categories" ? "category" : "menu_item";
  const { error: insertError } = await supabase.from("voucher_targets").insert(
    ids.map((targetId) => ({ voucher_id: voucherId, target_type: targetType, target_id: targetId })),
  );
  return insertError ? (insertError as PostgrestLikeError).message ?? "insert failed" : null;
}

/** Switch a voucher on or off. Throws, so an optimistic toggle can roll back. */
export async function setVoucherActive(
  voucherId: string,
  tenantId: string,
  isActive: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("vouchers")
    .update({ is_active: isActive })
    .eq("id", voucherId)
    .eq("tenant_id", tenantId);
  if (error) throw error;
}

export interface VoucherRedemption {
  amount: number;
  channel: VoucherChannel;
  createdAt: string;
  orderId: string;
}

interface RedemptionRow {
  amount_discounted: number | string | null;
  channel: string;
  created_at: string;
  order_id: string;
}

/** One voucher's most recent uses, newest first. */
export async function listVoucherRedemptions(
  voucherId: string,
  tenantId: string,
  limit: number = REDEMPTION_READ_LIMIT,
): Promise<VoucherRedemption[]> {
  const { data, error } = await supabase
    .from("voucher_redemptions")
    .select("amount_discounted, channel, created_at, order_id")
    .eq("voucher_id", voucherId)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return ((data ?? []) as RedemptionRow[]).map((row) => {
    const amount = Number(row.amount_discounted);
    return {
      amount: Number.isFinite(amount) ? amount : 0,
      channel: row.channel as VoucherChannel,
      createdAt: row.created_at,
      orderId: row.order_id,
    };
  });
}

export interface RedemptionSummary {
  count: number;
  totalDiscounted: number;
  averageDiscount: number;
  lastUsedAt: string | null;
  /** True when the read hit its limit, so the total covers only the latest uses. */
  isTruncated: boolean;
}

export function summarizeRedemptions(
  rows: readonly VoucherRedemption[],
  limit: number = REDEMPTION_READ_LIMIT,
): RedemptionSummary {
  const totalDiscounted = Math.round(rows.reduce((sum, row) => sum + row.amount, 0) * 100) / 100;
  return {
    count: rows.length,
    totalDiscounted,
    averageDiscount: rows.length > 0 ? Math.round((totalDiscounted / rows.length) * 100) / 100 : 0,
    lastUsedAt: rows[0]?.createdAt ?? null,
    isTruncated: rows.length >= limit,
  };
}
