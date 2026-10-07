/**
 * What the assistant may propose, and who may confirm each kind. The confirm
 * route re-checks this AND the writer re-checks the caller's permission
 * through the normal cookie session, so a proposal never outranks its author.
 */

import type { StaffPermissionKey } from '@/lib/staff-permissions'
import type { BoostIdea } from '@/lib/boost/ideas'
import type { MenuItemInput } from '@/lib/admin-service'
import type { StockMovementInput } from '@/lib/inventory/schemas'
import type { LastCallSaveInput } from '@/lib/boost/writes'
import type { LoyaltyProgramInput } from '@/lib/loyalty/manage'
import type { LoyaltyRules } from '@/lib/loyalty/types'
import type { ParsedMenuItem } from '@/types/ai-menu-parser'

export type ActionKind =
  | 'bundle'
  | 'upsell'
  | 'menu_item'
  | 'stock_adjustment'
  | 'sms_campaign'
  | 'voucher'
  | 'offer_change'
  | 'last_call'
  | 'loyalty_program'
  | 'loyalty_status'
  | 'campaign_status'
  | 'voucher_status'
  | 'menu_item_change'
  | 'menu_import'

export const ACTION_PERMISSION: Readonly<Record<ActionKind, StaffPermissionKey>> = {
  bundle: 'analytics',
  upsell: 'analytics',
  menu_item: 'menu',
  stock_adjustment: 'menu',
  sms_campaign: 'customers',
  voucher: 'vouchers',
  offer_change: 'analytics',
  last_call: 'analytics',
  // Loyalty writers sit behind no session check of their own (the web route
  // checks this grant), so the confirm route's check IS the boundary.
  loyalty_program: 'loyalty_manage',
  loyalty_status: 'loyalty_manage',
  campaign_status: 'customers',
  voucher_status: 'vouchers',
  menu_item_change: 'menu',
  menu_import: 'menu',
}

export interface OfferPayload {
  idea: BoostIdea
  /** Boost Sales was off when proposed: confirming switches it on too. */
  enableBoost: boolean
}

export interface MenuItemPayload {
  input: MenuItemInput
}

export interface StockPayload {
  input: StockMovementInput
  ingredientName: string
}

/** A live offer, addressed the way its writer addresses it (a pairing has no single id). */
export type OfferTarget =
  | { kind: 'combo'; id: string }
  | { kind: 'upgrade'; id: string }
  | { kind: 'pairing'; sourceIds: string[] }

/** What the confirm card showed; the executor refuses if the offer moved on since. */
export interface OfferSnapshot {
  isActive: boolean
  /** Combos only: the stored pricing at proposal time. */
  fixedPrice?: number | null
  discountPercent?: number | null
}

export interface OfferChangePayload {
  target: OfferTarget
  change: 'pause' | 'resume' | 'price'
  /** Set only for `price` (combos). */
  price: number | null
  name: string
  expected: OfferSnapshot
}

export interface LastCallPayload {
  input: LastCallSaveInput
  /** Boost Sales was off when proposed: confirming switches it on too. */
  enableBoost: boolean
}

export type LoyaltyProgramPayload =
  | { mode: 'create'; input: LoyaltyProgramInput }
  | { mode: 'revise'; programId: string; name: string; rules: LoyaltyRules; expectedVersion: number | null }

export interface LoyaltyStatusPayload {
  programId: string
  name: string
  to: 'active' | 'paused'
  expectedStatus: 'draft' | 'active' | 'paused'
}

export interface CampaignStatusPayload {
  campaignId: string
  name: string
}

export interface VoucherStatusPayload {
  voucherId: string
  code: string
  isActive: boolean
}

export interface MenuItemChangePayload {
  itemId: string
  name: string
  price: number | null
  isAvailable: boolean | null
  /** The price the confirm card showed as "now"; a different price at confirm refuses. */
  expectedPrice: number
}

/** A category the import uses: one the store has (matched by name), or one it will create. */
export interface MenuImportCategory {
  name: string
  icon: string | null
  isNew: boolean
}

/** Dishes read from menu photos, waiting for the owner's tap. */
export interface MenuImportPayload {
  categories: MenuImportCategory[]
  /** Each item's `category` is the exact `name` of one of `categories`. */
  items: ParsedMenuItem[]
}

export type ActionPayload = OfferPayload | MenuItemPayload | StockPayload | Record<string, unknown>

/** How long a proposal can wait for its tap. */
export const ACTION_TTL_MS = 30 * 60 * 1000

export type ExecuteOutcome =
  | { ok: true; message: string; resultRef: string | null; link?: { label: string; path: string } }
  | { ok: false; error: string }
