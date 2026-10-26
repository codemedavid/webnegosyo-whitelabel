/**
 * Senior/PWD claims at ONLINE checkout are the owner's choice, off by default:
 * most stores apply the discount at the counter, on the register, after
 * seeing the card. The switch lives on the tax profile and the server enforces
 * it — hiding the field is only the courtesy.
 */
import { describe, it, expect, jest } from '@jest/globals'
import { defaultTaxProfile, taxProfileFromRow, taxProfileToRow, type TaxProfile } from '@/lib/gov-discount'
import {
  ONLINE_CLAIMS_OFF_MESSAGE,
  priceCheckoutGovernment,
  type CheckoutGovInput,
} from '@/lib/gov-discount-checkout/checkout-government'
import { formValuesFromProfile, profileFromFormValues } from '@/lib/tax-settings/form-mapping'
import { taxSettingsFormSchema } from '@/lib/tax-settings/form-schema'
import type { PricedOrder } from '@/lib/vouchers/order-pricing'

const ONLINE_ON: TaxProfile = { ...defaultTaxProfile('vat'), onlineClaimsEnabled: true }

const input = (overrides: Partial<CheckoutGovInput> = {}): CheckoutGovInput => ({
  claim: { kind: 'senior', name: 'Juan Dela Cruz', idNumber: '12345' },
  items: [{ menu_item_id: 'm-sisig', menu_item_name: 'Sisig', quantity: 1, subtotal: 560 }],
  profile: ONLINE_ON,
  excludedMenuItemIds: new Set(),
  serviceCharge: 0,
  deliveryFee: 0,
  otherReduction: 0,
  ...overrides,
})

describe('the online-claims switch on the tax profile', () => {
  it('is off for a new store', () => {
    expect(defaultTaxProfile('vat').onlineClaimsEnabled).toBe(false)
    expect(defaultTaxProfile('non_vat').onlineClaimsEnabled).toBe(false)
  })

  it('reads as on only when the row says exactly true', () => {
    const row = taxProfileToRow(defaultTaxProfile('vat'))
    expect(taxProfileFromRow({ ...row, online_claims_enabled: true })?.onlineClaimsEnabled).toBe(true)
    expect(taxProfileFromRow({ ...row, online_claims_enabled: false })?.onlineClaimsEnabled).toBe(false)
    expect(taxProfileFromRow({ ...row, online_claims_enabled: null })?.onlineClaimsEnabled).toBe(false)
    expect(taxProfileFromRow({ ...row, online_claims_enabled: 'true' })?.onlineClaimsEnabled).toBe(false)
    const withoutColumn = Object.fromEntries(Object.entries(row).filter(([column]) => column !== 'online_claims_enabled'))
    expect(taxProfileFromRow(withoutColumn)?.onlineClaimsEnabled).toBe(false)
  })

  it('is written to its own column', () => {
    expect(taxProfileToRow(ONLINE_ON).online_claims_enabled).toBe(true)
    expect(taxProfileToRow(defaultTaxProfile('vat')).online_claims_enabled).toBe(false)
  })
})

describe('priceCheckoutGovernment with online claims off', () => {
  it('refuses the claim and sends the customer to the counter', () => {
    const outcome = priceCheckoutGovernment(input({ profile: defaultTaxProfile('vat') }))

    expect(outcome).toEqual({ status: 'refused', message: ONLINE_CLAIMS_OFF_MESSAGE })
  })

  it('prices the claim once the owner switches it on', () => {
    const outcome = priceCheckoutGovernment(input())

    expect(outcome.status).toBe('applied')
  })
})

describe('the Tax & discounts form', () => {
  it('starts a store with online claims off', () => {
    expect(formValuesFromProfile(null).onlineClaimsEnabled).toBe(false)
  })

  it('round-trips the switch', () => {
    const values = formValuesFromProfile(ONLINE_ON)
    expect(values.onlineClaimsEnabled).toBe(true)
    const parsed = taxSettingsFormSchema.parse({ ...values, vatStatus: 'vat' })
    expect(profileFromFormValues(parsed).onlineClaimsEnabled).toBe(true)
  })

  it('requires a yes or no', () => {
    const values = { ...formValuesFromProfile(ONLINE_ON), vatStatus: 'vat' as const }
    expect(taxSettingsFormSchema.safeParse({ ...values, onlineClaimsEnabled: 'yes' }).success).toBe(false)
  })
})

describe('applyCheckoutGovernment with online claims off', () => {
  it('leaves the voucher pricing alone and files nothing in the sales book', async () => {
    jest.resetModules()
    const recordGovDiscount = jest.fn(async () => undefined)
    jest.doMock('@/lib/gov-discount-ledger/supabase-store', () => ({
      createSupabaseLedgerStore: () => ({
        loadTaxProfile: async () => defaultTaxProfile('vat'),
        loadExcludedMenuItemIds: async () => new Set<string>(),
      }),
    }))
    jest.doMock('@/lib/gov-discount-ledger/record-service', () => ({ recordGovDiscount }))
    const { applyCheckoutGovernment } = await import('@/lib/gov-discount-checkout/apply-checkout-government')

    const voucherPricing = { totals: { subtotal: 560, grandTotal: 560 }, discountPayload: null } as unknown as PricedOrder
    const result = await applyCheckoutGovernment({
      db: {} as never,
      tenantId: '00000000-0000-4000-8000-000000000001',
      claim: { kind: 'senior', name: 'Juan Dela Cruz', idNumber: '12345' },
      items: [{ menu_item_id: 'm-sisig', menu_item_name: 'Sisig', quantity: 1, subtotal: 560 }],
      serviceCharge: 0,
      deliveryFee: 0,
      voucherPricing,
    })
    await result.recordFor('order-1', 'platform')

    expect(result.pricing).toBe(voucherPricing)
    expect(result.outcome).toEqual({ status: 'refused', message: ONLINE_CLAIMS_OFF_MESSAGE })
    expect(recordGovDiscount).not.toHaveBeenCalled()
  })
})

describe('the checkout setup read', () => {
  async function setupFor(profile: TaxProfile | null) {
    jest.resetModules()
    jest.doMock('@/lib/gov-discount-checkout/rate-limits', () => ({
      GOV_RATE_LIMITED_MESSAGE: 'limited',
      isGovSetupAllowed: async () => true,
      isGovPreviewAllowed: async () => true,
    }))
    jest.doMock('@/lib/supabase/admin', () => ({ ADMIN_QUERY_TIMEOUT_MS: 1000, createAdminClient: () => ({}) }))
    jest.doMock('@/lib/gov-discount-ledger/supabase-store', () => ({
      createSupabaseLedgerStore: () => ({ loadTaxProfile: async () => profile }),
    }))
    const { getCheckoutGovSetupAction } = await import('@/app/actions/gov-discount-checkout')
    return getCheckoutGovSetupAction('00000000-0000-4000-8000-000000000001')
  }

  it('tells the checkout the store takes claims only in person', async () => {
    const setup = await setupFor(defaultTaxProfile('vat'))

    expect(setup?.onlineClaims).toBe(false)
    expect(setup?.kinds.map((kind) => kind.kind)).toEqual(['senior', 'pwd'])
  })

  it('offers the claim field once the owner switches it on', async () => {
    expect((await setupFor(ONLINE_ON))?.onlineClaims).toBe(true)
  })

  it('shows nothing for a store without Tax & discounts set up', async () => {
    expect(await setupFor(null)).toBeNull()
  })
})
