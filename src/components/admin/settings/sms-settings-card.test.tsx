import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SmsSettingsCard } from './sms-settings-card'

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'token' } } }) } }),
}))

const TENANT = '11111111-1111-4111-8111-111111111111'
const status = (overrides: Record<string, unknown> = {}) => ({
  ok: true,
  json: async () => ({ gatewayOnline: false, lastSeenAt: null, fallback: { configured: false, senderName: null }, walletVerification: false, ...overrides }),
})
const bodyOf = (fetcher: jest.Mock, call: number) => JSON.parse(fetcher.mock.calls[call][1].body)

it('shows that nothing can send a code, then saves a key the server accepted', async () => {
  const fetcher = jest.fn()
    .mockResolvedValueOnce(status())
    .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) })
    .mockResolvedValueOnce(status({ fallback: { configured: true, senderName: 'MYCAFE' } }))
  global.fetch = fetcher
  render(<SmsSettingsCard tenantId={TENANT} canChangeKey />)
  expect(await screen.findByText(/no code can be sent/i)).toBeInTheDocument()
  expect(screen.getByText('○ Semaphore is off')).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText('Semaphore API key'), { target: { value: ' abc123 ' } })
  fireEvent.change(screen.getByLabelText('Sender name (optional)'), { target: { value: 'MYCAFE' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))

  expect(await screen.findByText('● Semaphore is on (sender: MYCAFE)')).toBeInTheDocument()
  expect(fetcher.mock.calls[1][1].headers.Authorization).toBe('Bearer token')
  expect(bodyOf(fetcher, 1)).toEqual({ tenantId: TENANT, action: 'save_fallback', apiKey: 'abc123', senderName: 'MYCAFE' })
  expect(screen.queryByText(/no code can be sent/i)).not.toBeInTheDocument()
})

it('sends no sender name when it is left blank, and refuses one Semaphore would reject', async () => {
  const fetcher = jest.fn().mockResolvedValueOnce(status()).mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) }).mockResolvedValueOnce(status())
  global.fetch = fetcher
  render(<SmsSettingsCard tenantId={TENANT} canChangeKey />)
  fireEvent.change(await screen.findByLabelText('Semaphore API key'), { target: { value: 'abc123' } })
  fireEvent.change(screen.getByLabelText('Sender name (optional)'), { target: { value: 'MY CAFE' } })
  expect(screen.getByText(/up to 11 letters or digits/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

  fireEvent.change(screen.getByLabelText('Sender name (optional)'), { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3))
  expect(bodyOf(fetcher, 1)).toEqual({ tenantId: TENANT, action: 'save_fallback', apiKey: 'abc123', senderName: null })
})

it('keeps the form and says why when Semaphore refuses the key', async () => {
  global.fetch = jest.fn()
    .mockResolvedValueOnce(status())
    .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Semaphore did not accept this API key. Copy it again from your Semaphore dashboard.' }) })
  render(<SmsSettingsCard tenantId={TENANT} canChangeKey />)
  fireEvent.change(await screen.findByLabelText('Semaphore API key'), { target: { value: 'wrong' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Semaphore did not accept this API key')
  expect(screen.getByText('○ Semaphore is off')).toBeInTheDocument()
})

it('removes the key', async () => {
  const fetcher = jest.fn()
    .mockResolvedValueOnce(status({ gatewayOnline: true, fallback: { configured: true, senderName: null } }))
    .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) })
    .mockResolvedValueOnce(status({ gatewayOnline: true }))
  global.fetch = fetcher
  render(<SmsSettingsCard tenantId={TENANT} canChangeKey />)
  fireEvent.click(await screen.findByRole('button', { name: 'Remove Semaphore' }))
  expect(await screen.findByText('○ Semaphore is off')).toBeInTheDocument()
  expect(bodyOf(fetcher, 1)).toEqual({ tenantId: TENANT, action: 'clear_fallback' })
  expect(screen.getByText('● A gateway phone is online')).toBeInTheDocument()
})

it('shows staff the status without the key form', async () => {
  global.fetch = jest.fn().mockResolvedValueOnce(status())
  render(<SmsSettingsCard tenantId={TENANT} canChangeKey={false} />)
  expect(await screen.findByText(/Only the store owner can add or remove/)).toBeInTheDocument()
  expect(screen.queryByLabelText('Semaphore API key')).not.toBeInTheDocument()
})

it('says so when text messages are not available for the store', async () => {
  global.fetch = jest.fn().mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Loyalty SMS delivery is not available yet.' }) })
  render(<SmsSettingsCard tenantId={TENANT} canChangeKey />)
  expect(await screen.findByRole('alert')).toHaveTextContent('not available yet')
  expect(screen.queryByLabelText('Semaphore API key')).not.toBeInTheDocument()
})
