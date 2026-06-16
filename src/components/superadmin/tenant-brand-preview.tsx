import { Panel, SectionHeader } from '@/components/superadmin/ui/primitives'

/* =============================================================================
   Live storefront brand preview for the tenant branding tab.

   Server-compatible (no hooks). Renders a compact mock storefront driven by the
   tenant's brand color fields so superadmins can see branding changes at a
   glance. Inline styles are used ONLY for tenant brand values (never theme
   tokens), which is exactly what they describe.
   ========================================================================== */

interface BrandPreviewData {
  name: string
  logo_url: string
  primary_color: string
  background_color: string
  header_color: string
  header_font_color: string
  cards_color: string
  cards_border_color: string
  text_primary_color: string
  text_secondary_color: string
  button_primary_color: string
  button_primary_text_color: string
}

export function TenantBrandPreview({ formData }: { formData: BrandPreviewData }) {
  const background = formData.background_color || '#0a0a0a'
  const header = formData.header_color || '#111111'
  const headerFont = formData.header_font_color || '#ffffff'
  const cardBg = formData.cards_color || '#161616'
  const cardBorder = formData.cards_border_color || 'rgba(255,255,255,0.1)'
  const textPrimary = formData.text_primary_color || '#ffffff'
  const textSecondary = formData.text_secondary_color || '#a1a1aa'
  const primary = formData.primary_color || '#c41e3a'
  const buttonBg = formData.button_primary_color || primary || '#ffffff'
  const buttonText = formData.button_primary_text_color || '#ffffff'
  const name = formData.name || 'Your Restaurant'

  return (
    <Panel className="max-w-sm">
      <SectionHeader title="Live preview" subtitle="How customers see your brand" />

      <div
        className="mt-4 overflow-hidden rounded-xl border border-white/10"
        style={{ backgroundColor: background }}
      >
        {/* Header bar */}
        <div
          className="flex items-center gap-3 px-4 py-3"
          style={{ backgroundColor: header, color: headerFont }}
        >
          {formData.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={formData.logo_url}
              alt={`${name} logo`}
              className="h-8 w-8 rounded-md object-cover"
            />
          ) : null}
          <span className="truncate text-sm font-semibold" style={{ color: headerFont }}>
            {name}
          </span>
        </div>

        {/* Sample product card */}
        <div className="p-4">
          <div
            className="rounded-xl border p-3"
            style={{ backgroundColor: cardBg, borderColor: cardBorder }}
          >
            <div
              className="mb-3 aspect-[4/3] w-full rounded-lg"
              style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
            />
            <p className="text-sm font-semibold" style={{ color: textPrimary }}>
              Signature Dish
            </p>
            <p className="mt-0.5 text-xs" style={{ color: textSecondary }}>
              A tasty sample item for your menu
            </p>
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-base font-bold" style={{ color: primary }}>
                ₱180
              </span>
              <button
                type="button"
                className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                style={{ backgroundColor: buttonBg, color: buttonText }}
              >
                Add to cart
              </button>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  )
}
