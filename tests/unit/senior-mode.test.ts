/**
 * Senior-friendly ordering mode — the pure rules behind the toggle.
 *
 * Older customers reported three things: they cannot find the cart or the
 * back button, they cannot tell whether a dish actually went into the cart,
 * and they cannot tell whether they are still in the cart, at checkout, or
 * already ordered. The mode answers each with larger, labelled UI; these tests
 * pin the decisions that UI is built on.
 */
import {
  describeAddedToCart,
  describeCartCount,
  isSeniorModeRoute,
  resolveSeniorModeEnabled,
  resolveSeniorOrderSteps,
  SENIOR_MODE_COLUMN,
} from '@/lib/senior-mode'
import { BRANDING_SURFACES } from '@/lib/branding-registry'
import { brandingPatchSchema, ROLLOUT_DEPENDENT_FIELDS } from '@/lib/branding-service'
import { TENANT_STOREFRONT_SELECT } from '@/lib/queries/tenant-storefront-select'

describe('isSeniorModeRoute', () => {
  it.each([
    '/menu',
    '/acme/menu',
    '/acme/menu/item/123',
    '/acme/cart',
    '/cart',
    '/acme/checkout',
    '/acme/order/abc',
    '/acme',
  ])('applies on the customer route %s', (pathname) => {
    expect(isSeniorModeRoute(pathname)).toBe(true)
  })

  it.each([
    '/admin',
    '/admin/orders',
    '/acme/admin',
    '/acme/admin/branding',
    '/login',
    '/acme/login',
  ])('never applies on the merchant route %s', (pathname) => {
    // The tenant layout wraps /admin too; the merchant's own dashboard must
    // not grow 12% because they switched on a customer setting.
    expect(isSeniorModeRoute(pathname)).toBe(false)
  })

  it('does not mistake a dish slug containing "admin" for the admin area', () => {
    expect(isSeniorModeRoute('/acme/menu/item/administrators-special')).toBe(true)
  })

  it('treats an unknown pathname as a customer route', () => {
    expect(isSeniorModeRoute(null)).toBe(true)
  })
})

describe('resolveSeniorModeEnabled', () => {
  it('is off unless the merchant saved it on', () => {
    expect(resolveSeniorModeEnabled(undefined, null)).toBe(false)
    expect(resolveSeniorModeEnabled(null, null)).toBe(false)
    expect(resolveSeniorModeEnabled(false, null)).toBe(false)
    expect(resolveSeniorModeEnabled(true, null)).toBe(true)
  })

  it('lets the Branding Studio draft preview the unsaved value', () => {
    expect(resolveSeniorModeEnabled(false, { [SENIOR_MODE_COLUMN]: true })).toBe(true)
    expect(resolveSeniorModeEnabled(true, { [SENIOR_MODE_COLUMN]: false })).toBe(false)
  })

  it('ignores a draft that does not carry a boolean for the field', () => {
    expect(resolveSeniorModeEnabled(true, {})).toBe(true)
    expect(resolveSeniorModeEnabled(true, { [SENIOR_MODE_COLUMN]: 'yes' })).toBe(true)
  })
})

describe('resolveSeniorOrderSteps', () => {
  it('marks earlier steps done, the current one current, later ones upcoming', () => {
    const steps = resolveSeniorOrderSteps('checkout')
    expect(steps.map((s) => [s.id, s.status])).toEqual([
      ['menu', 'done'],
      ['cart', 'done'],
      ['checkout', 'current'],
      ['done', 'upcoming'],
    ])
  })

  it('shows every step done once the order is placed', () => {
    expect(resolveSeniorOrderSteps('done').every((s) => s.status !== 'upcoming')).toBe(true)
    expect(resolveSeniorOrderSteps('done').at(-1)?.status).toBe('current')
  })

  it('numbers steps from 1 with plain-language labels', () => {
    const steps = resolveSeniorOrderSteps('cart')
    expect(steps.map((s) => s.number)).toEqual([1, 2, 3, 4])
    expect(steps.every((s) => s.label.length > 0)).toBe(true)
  })
})

describe('describeCartCount', () => {
  it('reads as a sentence fragment, singular and plural', () => {
    expect(describeCartCount(1)).toBe('1 item')
    expect(describeCartCount(3)).toBe('3 items')
  })

  it('says the cart is empty rather than "0 items"', () => {
    expect(describeCartCount(0)).toBe('Your cart is empty')
  })
})

describe('senior-friendly mode is a real, saveable, served setting', () => {
  it('is offered in the Branding Studio storefront surface', () => {
    const storefront = BRANDING_SURFACES.find((s) => s.id === 'storefront')
    const field = storefront?.sections.flatMap((s) => s.fields).find((f) => f.id === SENIOR_MODE_COLUMN)
    expect(field).toMatchObject({ type: 'toggle', default: false })
    // One setting for every device — a phone-only senior mode would be a trap.
    expect(field?.columnBacked).toBe(true)
  })

  it('is accepted by the branding save schema', () => {
    const parsed = brandingPatchSchema.safeParse({ [SENIOR_MODE_COLUMN]: true })
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data[SENIOR_MODE_COLUMN]).toBe(true)
  })

  it('is projected by the storefront tenant read, so a save reaches customers', () => {
    const tokens = TENANT_STOREFRONT_SELECT.split(/[\s,]+/).filter(Boolean)
    expect(tokens).toContain(SENIOR_MODE_COLUMN)
  })

  it('is skipped (not fatal) on a database where the migration has not run yet', () => {
    expect(ROLLOUT_DEPENDENT_FIELDS).toContain(SENIOR_MODE_COLUMN)
  })
})

describe('describeAddedToCart', () => {
  it('confirms in words what went in, in two short lines', () => {
    expect(describeAddedToCart('Chicken Adobo', 1)).toEqual({
      title: 'Added to your cart',
      description: 'Chicken Adobo',
    })
  })

  it('states the quantity when more than one was added', () => {
    expect(describeAddedToCart('Halo-Halo', 3).description).toBe('3 × Halo-Halo')
  })

  it('names the pickup date for a pre-order', () => {
    expect(describeAddedToCart('Lechon', 1, 'Sat, Sep 27').description).toBe('Lechon for Sat, Sep 27')
  })
})
