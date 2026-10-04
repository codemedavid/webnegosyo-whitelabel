import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LoyaltyWalletVerificationSetting } from './loyalty-wallet-verification-setting'

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'token' } } }) } }),
}))

const TENANT = '11111111-1111-4111-8111-111111111111'
const status = (overrides: Record<string, unknown> = {}) => ({
  ok: true,
  json: async () => ({ gatewayOnline: true, lastSeenAt: null, fallback: { configured: false, senderName: null }, walletVerification: false, ...overrides }),
})

it('loads the switch, turns it on with the merchant’s own token, and shows the saved value', async () => {
  const fetcher = jest.fn().mockResolvedValueOnce(status())
    .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, walletVerification: true }) })
  global.fetch = fetcher
  render(<LoyaltyWalletVerificationSetting tenantId={TENANT} />)
  const toggle = await screen.findByRole('switch', { name: 'Verify before showing rewards' })
  await waitFor(() => expect(toggle).toBeEnabled())
  expect(toggle).toHaveAttribute('aria-checked', 'false')
  fireEvent.click(toggle)
  await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'))
  expect(fetcher.mock.calls[1][1].headers.Authorization).toBe('Bearer token')
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ tenantId: TENANT, action: 'set_wallet_verification', enabled: true })
})

it('warns when it is on but no phone or backup can send a code', async () => {
  global.fetch = jest.fn().mockResolvedValueOnce(status({ gatewayOnline: false, walletVerification: true }))
  render(<LoyaltyWalletVerificationSetting tenantId={TENANT} />)
  expect(await screen.findByText(/customers can.t get a code right now/i)).toBeInTheDocument()
})

it('keeps the old value and says why when the save is refused', async () => {
  global.fetch = jest.fn().mockResolvedValueOnce(status())
    .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Forbidden' }) })
  render(<LoyaltyWalletVerificationSetting tenantId={TENANT} />)
  const toggle = await screen.findByRole('switch', { name: 'Verify before showing rewards' })
  await waitFor(() => expect(toggle).toBeEnabled())
  fireEvent.click(toggle)
  expect(await screen.findByRole('alert')).toHaveTextContent('Forbidden')
  expect(toggle).toHaveAttribute('aria-checked', 'false')
})

it('stays disabled when SMS codes are not available for the store', async () => {
  global.fetch = jest.fn().mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Loyalty SMS delivery is not available yet.' }) })
  render(<LoyaltyWalletVerificationSetting tenantId={TENANT} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('not available yet')
  expect(screen.getByRole('switch', { name: 'Verify before showing rewards' })).toBeDisabled()
})
