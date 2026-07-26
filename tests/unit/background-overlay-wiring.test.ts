/**
 * Guardrail: a background-overlay column that is not selected by the storefront
 * query, not accepted by the branding schema, or not listed in the Branding
 * Studio registry would silently no-op at runtime (the editor preview merges
 * the full draft, so the gap only shows after publish).
 */
import { describe, it, expect } from '@jest/globals'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  BACKGROUND_OVERLAY_COLUMNS,
  buildBackgroundRootStyle,
  resolveBackgroundOverlay,
} from '@/lib/background-overlay'
import { TENANT_STOREFRONT_SELECT } from '@/lib/queries/tenant-storefront-select'
import { brandingSchema, ROLLOUT_DEPENDENT_FIELDS } from '@/lib/branding-service'
import { BRANDING_SURFACES } from '@/lib/branding-registry'

const selectedColumns = TENANT_STOREFRONT_SELECT.split(',').map((c) => c.trim())

const registryFieldIds = BRANDING_SURFACES.flatMap((surface) =>
  surface.sections.flatMap((section) => section.fields.map((field) => field.id))
)

/** brandingSchema always requires the two core brand colors. */
const BASE_BRANDING = { primary_color: '#111111', secondary_color: '#666666' }

describe('background overlay wiring', () => {
  it.each([...BACKGROUND_OVERLAY_COLUMNS])('selects %s on the storefront query', (column) => {
    expect(selectedColumns).toContain(column)
  })

  it.each([...BACKGROUND_OVERLAY_COLUMNS])('exposes %s in the Branding Studio registry', (column) => {
    expect(registryFieldIds).toContain(column)
  })

  it.each([...BACKGROUND_OVERLAY_COLUMNS])('tolerates %s missing before the migration lands', (column) => {
    expect([...ROLLOUT_DEPENDENT_FIELDS]).toContain(column)
  })

  it('accepts a full background overlay payload', () => {
    const parsed = brandingSchema.safeParse({
      ...BASE_BRANDING,
      background_image_url: 'https://cdn.example.com/bg.jpg',
      background_image_opacity: 60,
      background_image_fit: 'cover',
      background_image_position: 'center',
      background_image_attachment: 'fixed',
      background_overlay_color: '#000000',
      background_overlay_opacity: 40,
    })

    expect(parsed.success).toBe(true)
  })

  it('accepts clearing the background image URL', () => {
    expect(brandingSchema.safeParse({ ...BASE_BRANDING, background_image_url: '' }).success).toBe(true)
  })

  it('rejects an out-of-range opacity', () => {
    expect(brandingSchema.safeParse({ ...BASE_BRANDING, background_overlay_opacity: 140 }).success).toBe(false)
  })

  it('rejects an unknown image fit', () => {
    expect(brandingSchema.safeParse({ ...BASE_BRANDING, background_image_fit: 'stretch' }).success).toBe(false)
  })

  it('exposes the image field as an upload-capable image control', () => {
    const field = BRANDING_SURFACES.flatMap((s) => s.sections.flatMap((sec) => sec.fields)).find(
      (f) => f.id === 'background_image_url'
    )

    expect(field?.type).toBe('image')
  })
})

/**
 * Guardrail: the storefront root paints an opaque `background-color`, and the
 * background layers are `z-index: -1` children of it. A negative-z child only
 * paints above its parent's own background when that parent establishes a
 * stacking context — otherwise it drops into the root stacking context and the
 * opaque color hides it completely. That is exactly the production outage:
 * both layers were present in the HTML and invisible on screen.
 *
 * Asserted at source level because the alternative is rendering the entire
 * storefront (menu-client / product-detail-content) in jsdom.
 */
describe('background overlay stacking', () => {
  const MOUNT_SITES = [
    'src/app/[tenant]/menu/menu-client.tsx',
    'src/components/customer/product-detail-content.tsx',
  ]

  it.each(MOUNT_SITES)('%s isolates the root that mounts the layers', (file) => {
    const source = readFileSync(join(process.cwd(), file), 'utf8')

    expect(source).toContain('buildBackgroundRootStyle')
  })

  it('isolates the root so a negative-z layer clears the opaque page color', () => {
    const visible = resolveBackgroundOverlay({
      background_image_url: 'https://cdn.example.com/bg.png',
    })

    expect(buildBackgroundRootStyle(visible)).toEqual({ isolation: 'isolate' })
  })

  it('leaves the root untouched for a tenant with no background configured', () => {
    expect(buildBackgroundRootStyle(resolveBackgroundOverlay({}))).toEqual({})
  })

  it('isolates for a tint-only background too', () => {
    const tintOnly = resolveBackgroundOverlay({ background_overlay_opacity: 40 })

    expect(buildBackgroundRootStyle(tintOnly)).toEqual({ isolation: 'isolate' })
  })
})
