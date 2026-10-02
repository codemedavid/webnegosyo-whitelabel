import { describe, it, expect } from '@jest/globals'
import { render, screen, within } from '@testing-library/react'
import type { SettingsTenantFacts, SettingsViewer } from '@/lib/settings/settings-catalog'

const owner: SettingsViewer = {
  isOwner: true,
  isStoreOwner: true,
  canManageAnyStaff: true,
  isBranchScopedAccount: false,
  hasPermission: () => true,
}

const tenant: SettingsTenantFacts = {
  slug: 'sukad',
  domain: null,
  is_active: true,
  operating_hours: null,
  enforce_operating_hours: false,
  distance_delivery_enabled: true,
  lalamove_enabled: false,
  facebook_page_id: undefined,
  messenger_username: undefined,
  footer_enabled: true,
  flash_screen_feature_enabled: false,
  flash_screen_is_active: false,
  multi_branch_enabled: false,
}

// next/jest leaves static imports ahead of jest.mock, so load lazily.
async function renderOverview() {
  const { buildSettingsCatalog } = await import('@/lib/settings/settings-catalog')
  const { SettingsOverview } = await import('@/components/admin/settings/settings-overview')
  const catalog = buildSettingsCatalog({ viewer: owner, tenant, tenantSlug: 'sukad' })
  render(<SettingsOverview storeName="Súkad" catalog={catalog} tenant={tenant} accountEmail="owner@sukad.ph" />)
}

describe('SettingsOverview', () => {
  it('lists every group as a heading', async () => {
    await renderOverview()

    for (const title of ['Your store', 'Orders & payments', 'Messenger & connections', 'Storefront', 'Team & account', 'Data']) {
      expect(screen.getByRole('heading', { level: 2, name: title })).toBeInTheDocument()
    }
  })

  it('links each section to its own page and each tool to its existing page', async () => {
    await renderOverview()

    expect(screen.getByRole('link', { name: /^Opening hours When you take orders/ })).toHaveAttribute('href', '/sukad/admin/settings/hours')
    expect(screen.getByRole('link', { name: /Payment methods/ })).toHaveAttribute('href', '/sukad/admin/payment-methods')
  })

  it('collects what still needs finishing into one notice with links', async () => {
    await renderOverview()

    const notice = screen.getByText('2 things to finish setting up').parentElement as HTMLElement
    expect(within(notice).getByRole('link', { name: /Opening hours — not set/ })).toBeInTheDocument()
    expect(within(notice).getByRole('link', { name: /Messenger — not connected/ })).toBeInTheDocument()
  })

  it('shows the current state beside a section', async () => {
    await renderOverview()

    expect(screen.getAllByText('Distance fee').length).toBeGreaterThan(0)
    expect(screen.getAllByText('owner@sukad.ph').length).toBeGreaterThan(0)
  })
})
