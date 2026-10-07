import { buildOnboardingView } from '@/lib/onboarding/view'
import type { StoreOnboarding } from '@/lib/onboarding/repository'

const ONBOARDING: StoreOnboarding = {
  id: 'onb-1',
  checkoutLeadId: 'lead-1',
  tenantId: 'tenant-1',
  status: 'running',
  answers: null,
  assets: { logoUrl: 'https://ik.imagekit.io/x/logo.png' },
  steps: { branding: { status: 'done', detail: 'Colors from your logo' }, menu: { status: 'running' } },
  summary: null,
  error: null,
  attempts: 1,
  launchRequestedAt: null,
  createdAt: '2026-10-06T00:00:00Z',
  updatedAt: '2026-10-06T00:00:00Z',
}

const LEAD = { business_name: "Juan's Kitchen", email: 'juan@example.com', status: 'setup_in_progress' }

describe('buildOnboardingView', () => {
  test('lists every build step in order, pending when not started', () => {
    // Act
    const view = buildOnboardingView({ onboarding: ONBOARDING, lead: LEAD, tenant: null })

    // Assert
    expect(view.steps.map((s) => s.id)).toEqual(['branding', 'menu', 'store_setup', 'boost', 'loyalty'])
    expect(view.steps[0]).toMatchObject({ status: 'done', detail: 'Colors from your logo' })
    expect(view.steps[2]).toMatchObject({ status: 'pending', detail: null })
  })

  test('the store links point at the owner login and the preview', () => {
    // Act
    const view = buildOnboardingView({
      onboarding: ONBOARDING,
      lead: LEAD,
      tenant: { name: "Juan's Kitchen", slug: 'juans-kitchen', is_prelaunch: true },
    })

    // Assert
    expect(view.store).toEqual({
      name: "Juan's Kitchen",
      slug: 'juans-kitchen',
      loginPath: '/juans-kitchen/login?redirect=%2Fjuans-kitchen%2Fadmin%2Flaunch',
      previewPath: '/juans-kitchen/menu',
      isLive: false,
    })
  })

  test('payment is confirmed only for paid or live leads', () => {
    expect(buildOnboardingView({ onboarding: ONBOARDING, lead: LEAD, tenant: null }).isPaymentConfirmed).toBe(false)
    expect(buildOnboardingView({ onboarding: ONBOARDING, lead: { ...LEAD, status: 'paid' }, tenant: null }).isPaymentConfirmed).toBe(true)
  })

  test('never exposes internal ids', () => {
    const json = JSON.stringify(buildOnboardingView({ onboarding: ONBOARDING, lead: LEAD, tenant: null }))
    expect(json).not.toContain('onb-1')
    expect(json).not.toContain('lead-1')
    expect(json).not.toContain('tenant-1')
  })

  test('a failed build hides its technical error from the buyer; a refused submit shows its message', () => {
    const failed = { ...ONBOARDING, status: 'failed' as const, error: 'OpenRouter API key not configured' }
    const refused = { ...ONBOARDING, status: 'awaiting_details' as const, error: 'This email already has a login.' }
    expect(buildOnboardingView({ onboarding: failed, lead: LEAD, tenant: null }).error).toBeNull()
    expect(buildOnboardingView({ onboarding: refused, lead: LEAD, tenant: null }).error).toBe('This email already has a login.')
  })

  test('a build that died mid-run is shown as failed, so the buyer gets the retry button', () => {
    // Arrange
    const now = Date.parse('2026-10-06T00:10:00Z')

    // Act
    const dead = buildOnboardingView({ onboarding: { ...ONBOARDING, status: 'running', updatedAt: '2026-10-06T00:00:00Z' }, lead: LEAD, tenant: null }, now)
    const live = buildOnboardingView({ onboarding: { ...ONBOARDING, status: 'running', updatedAt: '2026-10-06T00:09:00Z' }, lead: LEAD, tenant: null }, now)

    // Assert
    expect(dead.status).toBe('failed')
    expect(live.status).toBe('running')
  })
})
