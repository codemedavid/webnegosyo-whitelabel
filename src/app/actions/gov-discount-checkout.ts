'use server'

/**
 * Online checkout's Senior / PWD preview.
 *
 * A rendering hint only, like the voucher preview: `createOrderAction`
 * re-prices the claim from the server's own lines. Public (the storefront has
 * no session), so inputs are validated strictly and nothing private is
 * returned — only the store's VAT status, the kinds it offers and the money.
 */

import { z } from 'zod'
import {
  GOV_DISCOUNT_RULES,
  type GovDiscountKind,
  type VatStatus,
} from '@/lib/gov-discount'
import { parseCheckoutGovClaim, priceCheckoutGovernment } from '@/lib/gov-discount-checkout/checkout-government'
import type { OrderDiscountLine } from '@/lib/order-totals'

const uuid = z.string().uuid()
const money = z.number().finite().min(0).max(10_000_000)

export interface CheckoutGovKind {
  kind: GovDiscountKind
  label: string
  code: string
  idLabel: string
  idPlaceholder: string
}

export interface CheckoutGovSetup {
  vatStatus: VatStatus
  kinds: CheckoutGovKind[]
}

async function loadRules() {
  const [{ createAdminClient, ADMIN_QUERY_TIMEOUT_MS }, { createSupabaseLedgerStore }] = await Promise.all([
    import('@/lib/supabase/admin'),
    import('@/lib/gov-discount-ledger/supabase-store'),
  ])
  return createSupabaseLedgerStore(createAdminClient({ timeoutMs: ADMIN_QUERY_TIMEOUT_MS }))
}

/** Null when the store has not set up Tax & discounts (no field is shown). */
export async function getCheckoutGovSetupAction(tenantId: string): Promise<CheckoutGovSetup | null> {
  if (!uuid.safeParse(tenantId).success) return null
  try {
    const profile = await (await loadRules()).loadTaxProfile(tenantId)
    if (!profile) return null
    return {
      vatStatus: profile.vatStatus,
      kinds: profile.enabledKinds.map((kind) => {
        const rule = GOV_DISCOUNT_RULES[kind]
        return { kind, label: rule.label, code: rule.code, idLabel: rule.idLabel, idPlaceholder: rule.idPlaceholder }
      }),
    }
  } catch (error) {
    console.error('[gov-discount-checkout] setup read failed', error instanceof Error ? error.message : error)
    return null
  }
}

const previewSchema = z
  .object({
    tenantId: uuid,
    claim: z.unknown(),
    lines: z
      .array(
        z.object({
          menuItemId: z.string().max(64),
          name: z.string().max(200).optional(),
          quantity: z.number().int().min(1).max(10_000),
          subtotal: money,
        }),
      )
      .min(1)
      .max(200),
    serviceCharge: money.default(0),
    deliveryFee: money.nullable().default(null),
    otherReduction: money.default(0),
  })
  .strict()

export type CheckoutGovPreview =
  | { status: 'applied'; reduction: number; lines: OrderDiscountLine[] }
  | { status: 'outranked'; governmentReduction: number; otherReduction: number }
  | { status: 'refused'; message: string }
  | { status: 'unavailable' }

export async function previewCheckoutGovAction(input: unknown): Promise<CheckoutGovPreview> {
  const parsed = previewSchema.safeParse(input)
  if (!parsed.success) return { status: 'refused', message: 'Check the details and try again.' }
  const claim = parseCheckoutGovClaim(parsed.data.claim)
  if (!claim) return { status: 'refused', message: 'Enter the name and ID number exactly as printed on the card.' }

  try {
    const store = await loadRules()
    const [profile, excluded] = await Promise.all([
      store.loadTaxProfile(parsed.data.tenantId),
      store.loadExcludedMenuItemIds(
        parsed.data.tenantId,
        parsed.data.lines.map((line) => line.menuItemId),
      ),
    ])
    if (!profile) return { status: 'unavailable' }

    const outcome = priceCheckoutGovernment({
      claim,
      items: parsed.data.lines.map((line) => ({
        menu_item_id: line.menuItemId,
        menu_item_name: line.name,
        quantity: line.quantity,
        subtotal: line.subtotal,
      })),
      profile,
      excludedMenuItemIds: excluded,
      serviceCharge: parsed.data.serviceCharge,
      deliveryFee: parsed.data.deliveryFee ?? 0,
      otherReduction: parsed.data.otherReduction,
    })
    if (outcome.status === 'applied') {
      return { status: 'applied', reduction: outcome.reduction, lines: outcome.lines }
    }
    return outcome
  } catch (error) {
    console.error('[gov-discount-checkout] preview failed', error instanceof Error ? error.message : error)
    return { status: 'refused', message: 'Could not check the discount. Please try again.' }
  }
}
