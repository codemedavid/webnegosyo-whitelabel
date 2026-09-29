'use client'

import { FONT_OPTIONS, THEME_COLOR_KEYS, THEME_COLOR_LABELS, THEME_FONT_OPTIONS } from '@/lib/hero-builder/constants'

import { ColorField, Field, Group, NumberField, SelectField } from '../controls'
import type { HeroBuilderApi } from '../use-hero-builder'

const FONTS = THEME_FONT_OPTIONS.map((key) => ({ value: key, label: FONT_OPTIONS[key].label }))

export function ThemePanel({ api }: { api: HeroBuilderApi }) {
  const theme = api.design.theme
  return (
    <div>
      <p className="px-4 pt-4 text-[11px] leading-relaxed text-neutral-500">
        Theme colors and fonts are shared by every element that uses them. Leave a color blank to follow your store branding.
      </p>
      <Group title="Colors">
        {THEME_COLOR_KEYS.map((key) => (
          <Field key={key} label={THEME_COLOR_LABELS[key]}>
            <ColorField
              value={theme.colors[key]}
              allowThemeRefs={false}
              onChange={(value) => api.editTheme({ colors: { ...theme.colors, [key]: value } }, `color-${key}`)}
            />
          </Field>
        ))}
      </Group>
      <Group title="Fonts">
        <Field label="Headings" hint="Used by elements set to “Theme heading”.">
          <SelectField value={theme.headingFont} onChange={(headingFont) => api.editTheme({ headingFont })} options={FONTS} placeholder="Store default" />
        </Field>
        <Field label="Body text">
          <SelectField value={theme.bodyFont} onChange={(bodyFont) => api.editTheme({ bodyFont })} options={FONTS} placeholder="Store default" />
        </Field>
      </Group>
      <Group title="Buttons">
        <Field label="Default corner radius">
          <NumberField value={theme.buttonRadius} onChange={(v) => api.editTheme({ buttonRadius: v ?? 10 }, 'radius')} min={0} max={40} unit="px" />
        </Field>
      </Group>
    </div>
  )
}
