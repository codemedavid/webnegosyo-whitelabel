/**
 * The stamp card at checkout.
 *
 * A returning customer types the number they always give, and their card should
 * appear right there — that is the whole reason the number is worth typing. The
 * lookup is keyed on the DECLARED phone field, so a merchant who renamed it
 * still gets the card, and a store that is not really running loyalty is never
 * asked at all.
 */
import { readFileSync } from 'node:fs'
import { render, screen } from '@testing-library/react'
import { CHECKOUT_TEMPLATES } from '@/lib/checkout-templates'
import { CheckoutLoyaltyProgress } from '@/components/customer/checkout-templates/checkout-loyalty-progress'
import { getTenantBranding } from '@/lib/branding-utils'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'

const CARD = {
  earnedOnOrder: false,
  programName: 'Coffee Club',
  earnMode: 'stamp' as const,
  balance: 4,
  threshold: 8,
  rewardsAvailable: 0,
  rewardLabel: 'Free Latte',
}
const OFFER = { programName: 'Coffee Club', earnMode: 'stamp' as const, threshold: 8, rewardLabel: 'Free Latte', minSpend: null }

function fakeCheckout(overrides: Record<string, unknown> = {}): UseCheckoutReturn {
  const tenant = { id: 'tenant-1', name: 'Bean There', loyalty_enabled: true, loyalty_shadow: false }
  return {
    tenant,
    branding: getTenantBranding(tenant as unknown as Record<string, unknown>),
    formFields: [{ field_name: 'mobile', field_type: 'phone' }],
    customerData: { mobile: '09171234567' },
    outlet: { selectedOutletId: null },
    ...overrides,
  } as unknown as UseCheckoutReturn
}

function mockProgressFetch(): jest.Mock {
  const mock = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: true, offer: OFFER, card: CARD }) }))
  global.fetch = mock as unknown as typeof fetch
  return mock
}

afterEach(() => jest.restoreAllMocks())

it('shows the card for the number in the merchant\'s own phone field', async () => {
  const fetchMock = mockProgressFetch()
  render(<CheckoutLoyaltyProgress checkout={fakeCheckout()} />)

  const panel = await screen.findByTestId('loyalty-progress-panel', {}, { timeout: 3000 })
  expect(panel).toHaveTextContent('4 of 8 stamps toward Free Latte')
  expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)))
    .toMatchObject({ tenantId: 'tenant-1', phone: '+639171234567' })
})

it('asks nothing while the number is still incomplete', async () => {
  const fetchMock = mockProgressFetch()
  render(<CheckoutLoyaltyProgress checkout={fakeCheckout({ customerData: { mobile: '0917' } })} />)
  await new Promise(resolve => setTimeout(resolve, 800))

  expect(fetchMock).not.toHaveBeenCalled()
  expect(screen.queryByTestId('loyalty-progress-panel')).not.toBeInTheDocument()
})

it.each([
  ['switched off', { loyalty_enabled: false, loyalty_shadow: false }],
  ['only shadow-earning', { loyalty_enabled: true, loyalty_shadow: true }],
  ['unreadable', {}],
])('never asks a store whose loyalty is %s', async (_label, flags) => {
  const fetchMock = mockProgressFetch()
  const tenant = { id: 'tenant-1', name: 'Bean There', ...flags }
  render(<CheckoutLoyaltyProgress checkout={fakeCheckout({ tenant })} />)
  await new Promise(resolve => setTimeout(resolve, 800))

  expect(fetchMock).not.toHaveBeenCalled()
})

it('sends the chosen branch so a branch programme reads correctly', async () => {
  const fetchMock = mockProgressFetch()
  render(<CheckoutLoyaltyProgress checkout={fakeCheckout({ outlet: { selectedOutletId: 'outlet-a' } })} />)
  await screen.findByTestId('loyalty-progress-panel', {}, { timeout: 3000 })

  expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)))
    .toMatchObject({ outletId: 'outlet-a' })
})

/**
 * Five designs, one card. A design that renders its own fields (Classic does)
 * silently loses anything composed into CheckoutFields, which is exactly how
 * the consent box was nearly lost — so the registry, not a reviewer, is what
 * checks that every design still shows it.
 */
it.each(CHECKOUT_TEMPLATES.map(template => template.id))('checkout design %s shows the stamp card', (id) => {
  const source = readFileSync(`src/components/customer/checkout-templates/${id}-checkout.tsx`, 'utf8')
  expect(source).toMatch(/CheckoutFields|CheckoutLoyaltyProgress/)
})

it('the shared fields primitive is what carries the card for the designs that compose it', () => {
  const source = readFileSync('src/components/customer/checkout-templates/checkout-primitives.tsx', 'utf8')
  expect(source).toContain('<CheckoutLoyaltyProgress checkout={checkout} />')
})
