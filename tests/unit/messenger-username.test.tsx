/**
 * Tenant-managed Messenger username.
 *
 * `messenger_username` was superadmin-only, yet it is exactly what the "direct"
 * redirect mode uses to build the m.me link — so a merchant who switched pages
 * could not fix their own checkout handoff.
 *
 * Merchants paste whatever they have: a bare handle, an m.me link, a full
 * facebook.com URL, sometimes with a trailing slash or query string. All of those
 * must normalize to the bare handle the m.me link is built from, because a stored
 * "https://m.me/shop" would produce "m.me/https://m.me/shop" at checkout.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { normalizeMessengerUsername } from '@/lib/messenger-username'
import { MessengerModeCard } from '@/components/admin/messenger-mode-card'

// ---- Normalizer -----------------------------------------------------------

describe('normalizeMessengerUsername', () => {
  it('keeps a bare handle as-is', () => {
    expect(normalizeMessengerUsername('islandsilog')).toBe('islandsilog')
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeMessengerUsername('  islandsilog  ')).toBe('islandsilog')
  })

  it('strips a leading @', () => {
    expect(normalizeMessengerUsername('@islandsilog')).toBe('islandsilog')
  })

  it('extracts the handle from an m.me link', () => {
    expect(normalizeMessengerUsername('https://m.me/islandsilog')).toBe('islandsilog')
    expect(normalizeMessengerUsername('m.me/islandsilog')).toBe('islandsilog')
  })

  it('extracts the handle from a facebook.com page URL', () => {
    expect(normalizeMessengerUsername('https://www.facebook.com/islandsilog')).toBe('islandsilog')
    expect(normalizeMessengerUsername('https://facebook.com/islandsilog/')).toBe('islandsilog')
  })

  it('drops a query string and trailing slash', () => {
    expect(normalizeMessengerUsername('https://m.me/islandsilog/?ref=qr')).toBe('islandsilog')
  })

  it('returns an empty string when the merchant clears the field', () => {
    expect(normalizeMessengerUsername('')).toBe('')
    expect(normalizeMessengerUsername('   ')).toBe('')
    expect(normalizeMessengerUsername(null)).toBe('')
    expect(normalizeMessengerUsername(undefined)).toBe('')
  })

  it('rejects a URL with no handle rather than inventing one', () => {
    expect(normalizeMessengerUsername('https://facebook.com/')).toBe('')
  })
})

// ---- Admin card -----------------------------------------------------------

const updateTenantMessengerModeAction = jest.fn()
const updateTenantMessengerRedirectEnabledAction = jest.fn()
const updateTenantMessengerUsernameAction = jest.fn()

jest.mock('@/actions/tenants', () => ({
  updateTenantMessengerModeAction: (...args: unknown[]) => updateTenantMessengerModeAction(...args),
  updateTenantMessengerRedirectEnabledAction: (...args: unknown[]) =>
    updateTenantMessengerRedirectEnabledAction(...args),
  updateTenantMessengerUsernameAction: (...args: unknown[]) => updateTenantMessengerUsernameAction(...args),
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}))

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
}))

function renderCard(props: Record<string, unknown> = {}) {
  return render(
    <MessengerModeCard
      tenantId="tenant-1"
      currentMode="direct"
      currentRedirectEnabled
      currentUsername=""
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {...(props as any)}
    />
  )
}

describe('MessengerModeCard — Messenger username', () => {
  beforeEach(() => {
    updateTenantMessengerUsernameAction.mockReset()
    updateTenantMessengerUsernameAction.mockResolvedValue({ success: true })
  })

  it('shows the merchant their saved username', () => {
    renderCard({ currentUsername: 'islandsilog' })
    expect(screen.getByLabelText(/messenger username/i)).toHaveValue('islandsilog')
  })

  it('saves a pasted m.me link as the bare handle', async () => {
    const user = userEvent.setup()
    renderCard()

    await user.type(screen.getByLabelText(/messenger username/i), 'https://m.me/islandsilog')
    await user.click(screen.getByRole('button', { name: /save username/i }))

    expect(updateTenantMessengerUsernameAction).toHaveBeenCalledWith('tenant-1', 'islandsilog')
  })
})
