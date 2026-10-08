/**
 * The wizard wears the merchant's brand the moment they have one: the color
 * they picked, else the one read from their logo, else their store type's.
 * Everything goes through `buildLaunchBranding`, the same function the build
 * uses, so the live preview shows the palette the store will actually get.
 */

import type { CSSProperties } from 'react'
import { buildLaunchBranding, STORE_TYPES, type StoreType } from '@/lib/onboarding/store-type'

const HEX_COLOR = /^#[0-9a-f]{6}$/i

export interface StorePalette {
  brand: string
  /** Readable text on the brand color (the preview's header). */
  brandInk: string
  background: string
  surface: string
  border: string
  text: string
  textMuted: string
  button: string
  buttonInk: string
  price: string
}

export function resolveBrandColor(picked: string, logoColor: string | null, storeType: StoreType | ''): string | null {
  if (HEX_COLOR.test(picked)) return picked.toLowerCase()
  if (logoColor && HEX_COLOR.test(logoColor)) return logoColor.toLowerCase()
  return storeType ? STORE_TYPES[storeType].defaultColor : null
}

export function storePalette(brand: string, storeType: StoreType | '', storeName: string): StorePalette {
  const patch = buildLaunchBranding({
    storeType: storeType || 'other',
    storeName: storeName || 'Your store',
    brandColor: brand,
    hasItemPhotos: false,
  }) as Record<string, string>
  return {
    brand,
    brandInk: readableInk(brand),
    background: patch.background_color,
    surface: patch.cards_color,
    border: patch.border_color,
    text: patch.text_primary_color,
    textMuted: patch.text_secondary_color,
    button: patch.button_primary_color,
    buttonInk: patch.button_primary_text_color,
    price: patch.card_price_color,
  }
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const MIN_TEXT_CONTRAST = 4.5

/**
 * Text on `background`: white whenever it is readable (it matches the white
 * labels the build puts on brand-colored buttons), else whichever ink
 * contrasts more.
 */
export function readableInk(background: string): string {
  const l = luminance(background)
  const onWhite = 1.05 / (l + 0.05)
  if (onWhite >= MIN_TEXT_CONTRAST) return '#FFFFFF'
  return onWhite >= ((l + 0.05) / 0.05) ? '#FFFFFF' : '#111111'
}

/** CSS variables the wizard's controls read (`var(--ob-accent)` …). */
export function accentStyle(brand: string | null, storeType: StoreType | ''): CSSProperties {
  // Before the owner has a brand the set-up wears plain ink: the only color
  // on these pages is the one they give it.
  if (!brand) {
    return { '--ob-accent': '#17130F', '--ob-accent-ink': '#FFFFFF', '--ob-accent-soft': '#F6F4F1' } as CSSProperties
  }
  const palette = storePalette(brand, storeType, '')
  return {
    '--ob-accent': palette.button,
    '--ob-accent-ink': palette.buttonInk,
    '--ob-accent-soft': palette.background,
  } as CSSProperties
}

/** Hand-picked brand colors that all pass the build's contrast rules, with the names owners see. */
export const SUGGESTED_COLORS = [
  { hex: '#c0392b', name: 'Tomato' },
  { hex: '#d35400', name: 'Pumpkin' },
  { hex: '#b7791f', name: 'Mustard' },
  { hex: '#2f855a', name: 'Leaf' },
  { hex: '#0f766e', name: 'Teal' },
  { hex: '#2a6fdb', name: 'Ocean' },
  { hex: '#4c51bf', name: 'Indigo' },
  { hex: '#7c4dbd', name: 'Ube' },
  { hex: '#b83280', name: 'Berry' },
  { hex: '#7b4a2d', name: 'Cocoa' },
] as const
