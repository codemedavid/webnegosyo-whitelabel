import { Pencil } from 'lucide-react'
import type { HeroPreset } from '@/lib/storefront-theme'

/**
 * Additive hero presets — alternate layouts for the simple title/description
 * hero that renders when no advanced block-hero design is set. These are opt-in:
 * the default layout keeps rendering its own markup, so a tenant that never
 * picks a preset is byte-identical to today. Presets only rearrange the same
 * title, description, and edit affordance; every color is passed in from the
 * tenant's existing branding so nothing about the palette changes here.
 */
interface HeroPresetSectionProps {
  preset: Exclude<HeroPreset, 'theme'>
  title: string
  description: string
  titleColor: string
  descriptionColor: string
  accentColor: string
  isBrandAdmin?: boolean
  onEdit?: () => void
}

function EditButton({ onEdit }: { onEdit: () => void }) {
  return (
    <button
      type="button"
      onClick={onEdit}
      title="Edit hero section"
      aria-label="Edit hero section"
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white/95 text-gray-600 shadow-sm transition-colors hover:bg-white hover:text-gray-900"
    >
      <Pencil className="h-3.5 w-3.5" />
    </button>
  )
}

export function HeroPresetSection({
  preset,
  title,
  description,
  titleColor,
  descriptionColor,
  accentColor,
  isBrandAdmin = false,
  onEdit,
}: HeroPresetSectionProps) {
  const showEdit = isBrandAdmin && onEdit
  const edit = showEdit ? <EditButton onEdit={onEdit} /> : null

  if (preset === 'editorial') {
    return (
      <div className="text-left mb-16">
        <div
          className="mb-4 h-px w-16"
          style={{ backgroundColor: accentColor }}
        />
        <div className="inline-flex items-start gap-2">
          <h1 className="text-6xl font-serif font-bold mb-4 leading-tight" style={{ color: titleColor }}>
            {title}
          </h1>
          {edit}
        </div>
        <p className="text-lg font-light max-w-2xl hidden md:block" style={{ color: descriptionColor }}>
          {description}
        </p>
      </div>
    )
  }

  if (preset === 'split') {
    return (
      <div className="mb-16 flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-8">
        <div className="inline-flex items-start gap-2">
          <h1 className="text-5xl font-serif font-bold" style={{ color: titleColor }}>
            {title}
          </h1>
          {edit}
        </div>
        <p className="text-lg font-light md:max-w-sm md:text-right hidden md:block" style={{ color: descriptionColor }}>
          {description}
        </p>
      </div>
    )
  }

  if (preset === 'banner') {
    return (
      <div
        className="mb-16 rounded-2xl px-6 py-12 text-center md:py-16"
        style={{ backgroundColor: `${accentColor}12` }}
      >
        <div className="inline-flex items-center gap-2 justify-center">
          <h1 className="text-5xl font-serif font-bold mb-4" style={{ color: titleColor }}>
            {title}
          </h1>
          {edit}
        </div>
        <p className="text-lg font-light hidden md:block" style={{ color: descriptionColor }}>
          {description}
        </p>
      </div>
    )
  }

  if (preset === 'collage') {
    return (
      <div className="mb-16 pl-2 md:pl-6">
        <div className="inline-flex items-start gap-2">
          <h1
            className="text-6xl font-serif font-bold leading-none tracking-tight md:text-7xl"
            style={{ color: titleColor }}
          >
            {title}
          </h1>
          {edit}
        </div>
        <p
          className="mt-6 text-lg font-light md:max-w-md hidden md:block"
          style={{ color: descriptionColor }}
        >
          {description}
        </p>
      </div>
    )
  }

  if (preset === 'minimal') {
    return (
      <div className="text-center mb-16">
        <div className="inline-flex items-center gap-2 justify-center">
          <h1
            className="text-2xl font-semibold uppercase tracking-[0.3em] mb-3"
            style={{ color: titleColor }}
          >
            {title}
          </h1>
          {edit}
        </div>
        <p className="text-sm font-light tracking-wide hidden md:block" style={{ color: descriptionColor }}>
          {description}
        </p>
      </div>
    )
  }

  // 'centered' — the same centered serif stack as the default, named explicitly.
  return (
    <div className="text-center mb-16">
      <div className="inline-flex items-center gap-2 justify-center">
        <h1 className="text-5xl font-serif font-bold mb-4" style={{ color: titleColor }}>
          {title}
        </h1>
        {edit}
      </div>
      <p className="text-lg font-light hidden md:block" style={{ color: descriptionColor }}>
        {description}
      </p>
    </div>
  )
}
