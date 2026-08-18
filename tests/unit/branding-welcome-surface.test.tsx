import { describe, it, expect, jest } from '@jest/globals'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { BRANDING_SURFACES, BRANDING_FIELD_INDEX } from '@/lib/branding-registry'
import { getPreviewTarget } from '@/components/admin/branding-studio/preview-routes'
import { brandingPatchSchema, buildBrandingUpdatePayload } from '@/lib/branding-service'
import { FieldRow } from '@/components/admin/branding-studio/field-row'
import { OutletGate } from '@/components/customer/outlet-gate'
import type { Tenant, Outlet } from '@/types/database'

/**
 * The Branding Studio grows a "Welcome Page" surface for the multi-branch
 * starter screen: entry choice (tiles vs single CTA), headline copy, palette,
 * and format-aware promo banners. The live preview must be able to force the
 * gate open — an editor with a remembered branch would otherwise never see
 * the page they are editing.
 */

describe('welcome surface in the branding registry', () => {
  const surface = BRANDING_SURFACES.find((s) => s.id === 'welcome')

  it('exists with its own label and sections', () => {
    expect(surface).toBeDefined()
    expect(surface!.sections.length).toBeGreaterThan(0)
  })

  it('exposes the entry, copy, banner and palette fields', () => {
    for (const id of [
      'welcome_entry_mode',
      'welcome_show_order_types',
      'welcome_cta_text',
      'welcome_heading_text',
      'welcome_subheading_text',
      'welcome_page_banners',
      'welcome_background_color',
      'welcome_cta_background_color',
    ]) {
      expect(BRANDING_FIELD_INDEX[id]).toBeDefined()
    }
  })

  it('stores banners column-backed with per-banner formats', () => {
    const field = BRANDING_FIELD_INDEX['welcome_page_banners']
    expect(field.type).toBe('banners')
    expect(field.columnBacked).toBe(true)
    expect(field.bannerFormats).toBe(true)
  })

  it('previews on the menu route, where the gate lives', () => {
    expect(getPreviewTarget('demo', 'welcome').path).toBe('/demo/menu')
  })
})

describe('branding schema accepts the welcome fields', () => {
  it('accepts a full welcome patch including format-aware banners', () => {
    const parsed = brandingPatchSchema.safeParse({
      welcome_entry_mode: 'single_cta',
      welcome_show_order_types: false,
      welcome_cta_text: 'Order Na!',
      welcome_heading_text: 'Kamusta!',
      welcome_subheading_text: 'Pick a branch',
      welcome_page_banners: [
        { id: 'a', imageUrl: 'https://ik.example/a.jpg', format: 'portrait', title: 'Promo' },
      ],
      welcome_background_color: '#101014',
      welcome_cta_background_color: '#22c55e',
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects an unknown entry mode instead of persisting garbage', () => {
    expect(brandingPatchSchema.safeParse({ welcome_entry_mode: 'teleport' }).success).toBe(false)
  })

  it('rejects an unknown banner format', () => {
    const parsed = brandingPatchSchema.safeParse({
      welcome_page_banners: [{ id: 'a', imageUrl: 'u', format: 'panoramic' }],
    })
    expect(parsed.success).toBe(false)
  })

  it('turns a blanked banner list into [] like promotion_banners does', () => {
    const payload = buildBrandingUpdatePayload({ welcome_page_banners: '' })
    expect(payload.welcome_page_banners).toEqual([])
  })
})

describe('BannersRow with per-banner formats', () => {
  it('offers the three formats and reports a format change', () => {
    const onChange = jest.fn()
    render(
      <FieldRow
        field={{ id: 'welcome_page_banners', label: 'Banners', type: 'banners', columnBacked: true, bannerFormats: true }}
        value={[{ id: 'a', imageUrl: 'https://ik.example/a.jpg', format: 'landscape' }]}
        onChange={onChange}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /portrait/i }))
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'a', format: 'portrait' }),
    ])
  })

  it('keeps the plain banner editor format-free for the menu banners', () => {
    render(
      <FieldRow
        field={{ id: 'promotion_banners', label: 'Banners', type: 'banners', columnBacked: true }}
        value={[{ id: 'a', imageUrl: 'https://ik.example/a.jpg' }]}
        onChange={jest.fn()}
      />
    )
    expect(screen.queryByRole('button', { name: /portrait/i })).not.toBeInTheDocument()
  })
})

describe('OutletGate preview forcing', () => {
  const outlet = (id: string): Outlet =>
    ({
      id,
      tenant_id: 't1',
      slug: id,
      name: id,
      address: null,
      image_url: null,
      operating_hours: null,
      timezone: 'Asia/Manila',
      latitude: null,
      longitude: null,
      delivery_radius_km: null,
      supports_pickup: true,
      supports_delivery: true,
      supports_dine_in: true,
      is_active: true,
      sort_order: 0,
    }) as unknown as Outlet

  it('shows the welcome page in preview even for a tenant the gate would skip', () => {
    // Single branch + flag off: the real gate renders nothing. The studio
    // preview must still show the page being edited.
    const tenant = {
      id: 't1',
      name: 'Gungjeon',
      slug: 'demo',
      multi_branch_enabled: false,
      welcome_heading_text: 'Kamusta!',
    } as unknown as Tenant
    render(
      <OutletGate tenant={tenant} tenantSlug="demo" outlets={[outlet('a')]} isPreview />
    )
    expect(screen.getByText('Kamusta!')).toBeInTheDocument()
  })

  it('renders nothing outside preview for that same tenant', () => {
    const tenant = { id: 't1', name: 'G', slug: 'demo', multi_branch_enabled: false } as unknown as Tenant
    const { container } = render(
      <OutletGate tenant={tenant} tenantSlug="demo" outlets={[outlet('a')]} />
    )
    expect(container).toBeEmptyDOMElement()
  })
})

describe('welcome header controls in the studio', () => {
  it('exposes the alignment and logo fields', () => {
    expect(BRANDING_FIELD_INDEX['welcome_text_align']).toBeDefined()
    expect(BRANDING_FIELD_INDEX['welcome_show_logo']).toBeDefined()
    expect(BRANDING_FIELD_INDEX['welcome_show_logo'].type).toBe('toggle')
  })

  it('accepts them in a branding patch and rejects an unknown alignment', () => {
    expect(
      brandingPatchSchema.safeParse({ welcome_text_align: 'center', welcome_show_logo: true }).success
    ).toBe(true)
    expect(brandingPatchSchema.safeParse({ welcome_text_align: 'justify' }).success).toBe(false)
  })

  it('offers the header and copy switches as toggles', () => {
    expect(BRANDING_FIELD_INDEX['welcome_show_header'].type).toBe('toggle')
    expect(BRANDING_FIELD_INDEX['welcome_show_copy'].type).toBe('toggle')
  })

  it('defaults both switches on so an untouched tenant keeps its header', () => {
    expect(BRANDING_FIELD_INDEX['welcome_show_header'].default).toBe(true)
    expect(BRANDING_FIELD_INDEX['welcome_show_copy'].default).toBe(true)
  })

  it('accepts the switches in a branding patch', () => {
    expect(
      brandingPatchSchema.safeParse({ welcome_show_header: false, welcome_show_copy: false }).success
    ).toBe(true)
  })
})
