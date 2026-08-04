/**
 * Telling the caller when a write it just made will not be seen by anyone.
 *
 * Bundles and upsell pairs are gated per tenant: `bundles_enabled` and
 * `menu_engineering_enabled` (with `checkout_upsell_enabled` nested under it).
 * Creating one while its flag is off SUCCEEDS at the database and changes
 * nothing on the storefront. To an AI that reads its own tool result as truth,
 * that is indistinguishable from having built the merchant a working promo —
 * so it will report success, move on, and the merchant will find nothing.
 *
 * The warning is attached to the result rather than raised as an error: the row
 * really was written, and refusing would strand a caller that is deliberately
 * staging content before switching the feature on.
 */

import { featureWarningFor, withFeatureWarning } from '@/lib/mcp/feature-flag-warnings'

describe('featureWarningFor', () => {
  it('warns when bundles are written while the bundles flag is off', () => {
    const warning = featureWarningFor('bundles', { bundles_enabled: false })

    expect(warning).toMatch(/bundles_enabled/)
    expect(warning).toMatch(/not appear|will not be shown|inert/i)
  })

  it('stays silent when the bundles flag is on', () => {
    expect(featureWarningFor('bundles', { bundles_enabled: true })).toBeNull()
  })

  it('warns when an upsell is written while menu engineering is off', () => {
    const warning = featureWarningFor('upsells', { menu_engineering_enabled: false })

    expect(warning).toMatch(/menu_engineering_enabled/)
  })

  it('warns about the checkout interstitial only when its own flag is off', () => {
    expect(
      featureWarningFor('checkout_upsell', {
        menu_engineering_enabled: true,
        checkout_upsell_enabled: false,
      }),
    ).toMatch(/checkout_upsell_enabled/)

    expect(
      featureWarningFor('checkout_upsell', {
        menu_engineering_enabled: true,
        checkout_upsell_enabled: true,
      }),
    ).toBeNull()
  })

  it('names the master flag when checkout upsell is on but menu engineering is off', () => {
    // checkout_upsell_enabled is nested under menu_engineering_enabled, so the
    // nested flag alone does nothing — reporting only the nested one would send
    // the merchant to the wrong switch.
    const warning = featureWarningFor('checkout_upsell', {
      menu_engineering_enabled: false,
      checkout_upsell_enabled: true,
    })

    expect(warning).toMatch(/menu_engineering_enabled/)
  })

  it('warns when the flag column is missing rather than assuming it is on', () => {
    // An unread or absent column is unknown, not enabled. Assuming enabled is
    // the failure that produces a silent no-op.
    expect(featureWarningFor('bundles', {})).toMatch(/bundles_enabled/)
  })
})

describe('withFeatureWarning', () => {
  it('attaches the warning to the write result without hiding the result', () => {
    const result = withFeatureWarning({ id: 'b1', name: 'Meal Deal' }, 'bundles', {
      bundles_enabled: false,
    })

    expect(result).toMatchObject({ id: 'b1', name: 'Meal Deal' })
    expect((result as { warning?: string }).warning).toMatch(/bundles_enabled/)
  })

  it('leaves the result untouched when the feature is live', () => {
    const result = withFeatureWarning({ id: 'b1' }, 'bundles', { bundles_enabled: true })

    expect(result).toEqual({ id: 'b1' })
    expect(result).not.toHaveProperty('warning')
  })

  it('does not mutate the result it was given', () => {
    const original = { id: 'b1' }

    withFeatureWarning(original, 'bundles', { bundles_enabled: false })

    expect(original).not.toHaveProperty('warning')
  })

  it('still returns something useful when the write returned null', () => {
    const result = withFeatureWarning(null, 'bundles', { bundles_enabled: false })

    expect((result as { warning?: string }).warning).toMatch(/bundles_enabled/)
  })
})
