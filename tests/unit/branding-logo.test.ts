/**
 * Tenant-managed logo.
 *
 * `logo_url` used to be superadmin-only, so a merchant had to file a request to
 * swap their own logo. It now belongs to the Branding Studio, next to the colors
 * and the footer logo it sits beside on the storefront.
 *
 * Two things must hold: the branding write schema has to carry the field (a zod
 * object strips unknown keys, so a missing key would silently discard the upload),
 * and the column is NOT NULL — clearing the logo must write '' and never null.
 */

import { describe, it, expect } from '@jest/globals'
import { brandingSchema, buildBrandingUpdatePayload } from '@/lib/branding-service'
import { BRANDING_SURFACES, BRANDING_FIELD_INDEX } from '@/lib/branding-registry'

function parse(overrides: Record<string, unknown> = {}) {
  return brandingSchema.parse({
    primary_color: '#ff0000',
    secondary_color: '#00ff00',
    ...overrides,
  })
}

describe('brandingSchema — logo_url', () => {
  it('carries an uploaded logo through to the database payload', () => {
    const payload = buildBrandingUpdatePayload(parse({ logo_url: 'https://ik.imagekit.io/x/logo.png' }))
    expect(payload).toMatchObject({ logo_url: 'https://ik.imagekit.io/x/logo.png' })
  })

  it('accepts a blank value so "reset section" can clear the logo', () => {
    expect(() => parse({ logo_url: '' })).not.toThrow()
  })

  it('never writes null into the NOT NULL logo_url column', () => {
    const payload = buildBrandingUpdatePayload(parse({ logo_url: '' }))
    if ('logo_url' in payload) {
      expect(payload.logo_url).not.toBeNull()
    }
  })

  it('stays optional, so saving any other section leaves the logo untouched', () => {
    const payload = buildBrandingUpdatePayload(parse())
    expect(payload.logo_url).toBeUndefined()
  })
})

describe('branding registry — logo field', () => {
  it('exposes the logo as an editable image field', () => {
    expect(BRANDING_FIELD_INDEX.logo_url).toMatchObject({ id: 'logo_url', type: 'image' })
  })

  it('places the logo on the Global Brand surface, with the rest of the brand identity', () => {
    const global = BRANDING_SURFACES.find((surface) => surface.id === 'global')
    const fieldIds = global?.sections.flatMap((section) => section.fields.map((field) => field.id)) ?? []
    expect(fieldIds).toContain('logo_url')
  })
})
